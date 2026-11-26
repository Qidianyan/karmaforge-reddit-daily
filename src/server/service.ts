import {
  MAX_ATTEMPTS,
  applyStreakWin,
  buildPlayerStreak,
  buildSeedCommunityNominees,
  computeCrowdConsensus,
  computeLeaderboardSortKey,
  computeSpeedCombo,
  generateSpoilerFreeShareMarkdown,
  getArchiveDateKeys,
  getEffectiveCurrentStreak,
  getMaxAttempts,
  getPuzzleForDate,
  getTomorrowUtcDateKey,
  getUtcDateKey,
  gradeAttempt,
  isValidDateKey,
  sanitizeCommunityDraft,
  sortCommunitySubmissions,
  toPublicPuzzlePayload,
  validateCommunityPuzzleDraft,
  validateIronForgeConstraints,
  validateSubmissionCardIds,
} from '../shared/index.js';
import type {
  ArchiveEditionSummary,
  ArchiveResponse,
  AttemptRecord,
  CommunityForgeCreateResponse,
  CommunityForgeDraftInput,
  CommunityForgeListResponse,
  CommunityPuzzleSubmission,
  CommunityVoteRequestBody,
  CommunityVoteResponse,
  DailyCommunityStats,
  GameStateResponse,
  GuessRequestBody,
  HintRequestBody,
  LeaderboardEntry,
  PlayerDailyProgress,
  PlayerStreak,
  PuzzleDefinition,
  PuzzleSolutionReveal,
  ShareCommentRequestBody,
  ShareCommentResponse,
  SharedCommentItem,
} from '../shared/index.js';
import type { KvStore, RequestActor, RuntimeBridge } from './storage.js';

function streakKey(userId: string): string {
  return `kf:user:${userId}:streak`;
}

function userDayKey(userId: string, dateKey: string): string {
  return `kf:user:${userId}:day:${dateKey}`;
}

function dayStatsKey(dateKey: string): string {
  return `kf:day:${dateKey}:stats`;
}

function dayPlayersKey(dateKey: string): string {
  return `kf:day:${dateKey}:players`;
}

function dayLeaderboardKey(dateKey: string): string {
  return `kf:day:${dateKey}:lb`;
}

function dayLeaderboardMetaKey(dateKey: string): string {
  return `kf:day:${dateKey}:lbmeta`;
}

function daySharesKey(dateKey: string): string {
  return `kf:day:${dateKey}:shares`;
}

export function resolveDateKey(requested: string | undefined, todayUtc: string): string {
  if (!requested) {
    return todayUtc;
  }
  const trimmed = requested.trim();
  if (!isValidDateKey(trimmed)) {
    throw new Error(`Invalid UTC date "${trimmed}". Expected YYYY-MM-DD.`);
  }
  if (trimmed > todayUtc) {
    throw new Error(`Future puzzle "${trimmed}" has not unlocked yet. Come back at 00:00 UTC!`);
  }
  return trimmed;
}

async function readStoredStreak(
  store: KvStore,
  userId: string,
  todayUtc: string,
): Promise<{
  rawCurrentStreak: number;
  bestStreak: number;
  totalSolved: number;
  lastSolvedDate: string | null;
  playerStreak: PlayerStreak;
}> {
  const hash = await store.hGetAll(streakKey(userId));
  const rawCurrentStreak = Number.parseInt(hash.currentStreak ?? '0', 10) || 0;
  const bestStreak = Number.parseInt(hash.bestStreak ?? '0', 10) || 0;
  const totalSolved = Number.parseInt(hash.totalSolved ?? '0', 10) || 0;
  const lastSolvedDate = hash.lastSolvedDate && hash.lastSolvedDate.length > 0 ? hash.lastSolvedDate : null;

  const effectiveStreak = getEffectiveCurrentStreak(rawCurrentStreak, lastSolvedDate, todayUtc);
  const playerStreak = buildPlayerStreak({
    currentStreak: effectiveStreak,
    bestStreak,
    totalSolved,
    lastSolvedDate,
  });

  return { rawCurrentStreak, bestStreak, totalSolved, lastSolvedDate, playerStreak };
}

async function readOrInitDailyProgress(
  store: KvStore,
  userId: string,
  dateKey: string,
  puzzleId: string,
): Promise<PlayerDailyProgress> {
  const raw = await store.get(userDayKey(userId, dateKey));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PlayerDailyProgress;
      if (parsed && parsed.puzzleId === puzzleId && Array.isArray(parsed.attempts)) {
        return parsed;
      }
    } catch {
      // Re-initialize cleanly if stored blob is malformed.
    }
  }
  return {
    dateKey,
    puzzleId,
    status: 'playing',
    hardMode: false,
    attempts: [],
    hintsUsed: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    elapsedSeconds: null,
    score: null,
    sharedToThread: false,
  };
}

function buildSolutionReveal(puzzle: PuzzleDefinition): PuzzleSolutionReveal {
  const debriefByCardId: Record<string, { isRedHerring: boolean; debrief: string }> = {};
  for (const card of puzzle.cards) {
    debriefByCardId[card.id] = {
      isRedHerring: card.isRedHerring,
      debrief: card.debrief,
    };
  }
  return {
    solutionIds: puzzle.solutionIds,
    debriefByCardId,
  };
}

export async function readDailyStats(store: KvStore, dateKey: string): Promise<DailyCommunityStats> {
  const stats = await store.hGetAll(dayStatsKey(dateKey));
  const totalPlayers = Number.parseInt(stats.totalPlayers ?? '0', 10) || 0;
  const totalSolves = Number.parseInt(stats.totalSolves ?? '0', 10) || 0;
  const totalMovesSum = Number.parseInt(stats.totalMovesSum ?? '0', 10) || 0;
  const totalSecondsSum = Number.parseInt(stats.totalSecondsSum ?? '0', 10) || 0;
  const ironForgeSolves = Number.parseInt(stats.ironSolves ?? '0', 10) || 0;
  const moveDistribution = {
    moves1: Number.parseInt(stats.moves_1 ?? '0', 10) || 0,
    moves2: Number.parseInt(stats.moves_2 ?? '0', 10) || 0,
    moves3: Number.parseInt(stats.moves_3 ?? '0', 10) || 0,
    moves4: Number.parseInt(stats.moves_4 ?? '0', 10) || 0,
    moves5: Number.parseInt(stats.moves_5 ?? '0', 10) || 0,
    losses: Number.parseInt(stats.losses ?? '0', 10) || 0,
  };

  return {
    totalPlayers,
    totalSolves,
    solveRatePct: totalPlayers > 0 ? Math.round((totalSolves / totalPlayers) * 100) : 0,
    avgMoves: totalSolves > 0 ? Number((totalMovesSum / totalSolves).toFixed(1)) : null,
    avgSeconds: totalSolves > 0 ? Math.round(totalSecondsSum / totalSolves) : null,
    ironForgeSolves,
    moveDistribution,
  };
}

interface StoredLbMeta {
  username: string;
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  score: number;
  flairTitle: string;
  streak: number;
  hardMode?: boolean;
  completedAt: string;
}

export async function readDailyLeaderboard(
  store: KvStore,
  dateKey: string,
  limit = 15,
): Promise<LeaderboardEntry[]> {
  const rows = await store.zRange(dayLeaderboardKey(dateKey), 0, limit - 1);
  if (rows.length === 0) {
    return [];
  }
  const metaMap = await store.hGetAll(dayLeaderboardMetaKey(dateKey));
  const entries: LeaderboardEntry[] = [];

  rows.forEach((row, index) => {
    const rawMeta = metaMap[row.member];
    if (!rawMeta) {
      return;
    }
    try {
      const meta = JSON.parse(rawMeta) as StoredLbMeta;
      entries.push({
        rank: index + 1,
        username: meta.username,
        moves: meta.moves,
        elapsedSeconds: meta.elapsedSeconds,
        hintsUsed: meta.hintsUsed,
        score: meta.score,
        flairTitle: meta.flairTitle,
        streak: meta.streak,
        hardMode: Boolean(meta.hardMode),
        completedAt: meta.completedAt,
      });
    } catch {
      // Skip malformed entry gracefully.
    }
  });

  return entries;
}

export async function readRecentShares(store: KvStore, dateKey: string): Promise<SharedCommentItem[]> {
  const raw = await store.get(daySharesKey(dateKey));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SharedCommentItem[]) : [];
  } catch {
    return [];
  }
}

export async function buildGameState(
  store: KvStore,
  bridge: RuntimeBridge,
  actor: RequestActor,
  requestedDateKey?: string,
  now: Date = new Date(),
): Promise<GameStateResponse> {
  const todayUtc = getUtcDateKey(now);
  const activeDateKey = resolveDateKey(requestedDateKey, todayUtc);
  const { puzzle, issueNumber } = getPuzzleForDate(activeDateKey);
  const publicPuzzle = toPublicPuzzlePayload(puzzle, activeDateKey, issueNumber);

  const [progress, streakInfo, stats, leaderboard, recentShares] = await Promise.all([
    readOrInitDailyProgress(store, actor.userId, activeDateKey, puzzle.id),
    readStoredStreak(store, actor.userId, todayUtc),
    readDailyStats(store, activeDateKey),
    readDailyLeaderboard(store, activeDateKey),
    readRecentShares(store, activeDateKey),
  ]);

  const isConcluded = progress.status !== 'playing';
  const revealedHints = puzzle.hints.slice(0, Math.min(progress.hintsUsed, puzzle.hints.length));
  const crowdConsensus = isConcluded
    ? computeCrowdConsensus({
        difficulty: puzzle.difficulty,
        liveDistribution: stats.moveDistribution,
        ironForgeSolves: stats.ironForgeSolves,
        playerStatus: progress.status,
        playerMoves: progress.attempts.length,
        playerElapsedSeconds: progress.elapsedSeconds,
        playerHardMode: Boolean(progress.hardMode),
      })
    : null;

  const shareMarkdown = isConcluded
    ? generateSpoilerFreeShareMarkdown({
        puzzle: publicPuzzle,
        status: progress.status,
        attempts: progress.attempts,
        elapsedSeconds: progress.elapsedSeconds,
        hintsUsed: progress.hintsUsed,
        streak: streakInfo.playerStreak,
        hardMode: Boolean(progress.hardMode),
        crowdConsensus,
      })
    : null;

  return {
    todayUtc,
    activeDateKey,
    isToday: activeDateKey === todayUtc,
    runtimeMode: bridge.runtimeMode,
    username: actor.username,
    subredditName: actor.subredditName,
    puzzle: publicPuzzle,
    progress,
    revealedHints,
    streak: streakInfo.playerStreak,
    stats,
    crowdConsensus,
    leaderboard,
    recentShares,
    solutionReveal: isConcluded ? buildSolutionReveal(puzzle) : null,
    shareMarkdown,
  };
}

export async function handleGuessSubmission(
  store: KvStore,
  bridge: RuntimeBridge,
  actor: RequestActor,
  body: GuessRequestBody,
  now: Date = new Date(),
): Promise<GameStateResponse> {
  const todayUtc = getUtcDateKey(now);
  const activeDateKey = resolveDateKey(body.dateKey, todayUtc);
  const { puzzle } = getPuzzleForDate(activeDateKey);

  const validationError = validateSubmissionCardIds(puzzle, body.cardIds);
  if (validationError) {
    throw new Error(validationError);
  }

  const progress = await readOrInitDailyProgress(store, actor.userId, activeDateKey, puzzle.id);
  if (progress.status !== 'playing') {
    return buildGameState(store, bridge, actor, activeDateKey, now);
  }

  // Lock Iron Forge (Hard Mode) choice on Attempt 1 so players cannot toggle mid-game.
  if (progress.attempts.length === 0) {
    progress.hardMode = Boolean(body.hardMode);
  }

  if (progress.hardMode && progress.attempts.length > 0) {
    const ironError = validateIronForgeConstraints(progress.attempts, body.cardIds);
    if (ironError) {
      throw new Error(ironError);
    }
  }

  // Register player participation once per UTC day.
  const playersHash = await store.hGetAll(dayPlayersKey(activeDateKey));
  if (!playersHash[actor.userId]) {
    await store.hSet(dayPlayersKey(activeDateKey), { [actor.userId]: '1' });
    await store.hIncrBy(dayStatsKey(activeDateKey), 'totalPlayers', 1);
  }

  const graded = gradeAttempt(puzzle, body.cardIds);
  const attemptRecord: AttemptRecord = {
    attemptNumber: progress.attempts.length + 1,
    slots: graded.slots,
    exactCount: graded.exactCount,
    misplacedCount: graded.misplacedCount,
    wrongCount: graded.wrongCount,
    submittedAt: now.toISOString(),
  };

  progress.attempts.push(attemptRecord);

  const startedMs = Date.parse(progress.startedAt);
  const computedElapsed = Number.isFinite(startedMs)
    ? Math.max(1, Math.round((now.getTime() - startedMs) / 1000))
    : 1;
  const elapsedSeconds =
    typeof body.elapsedSeconds === 'number' &&
    Number.isFinite(body.elapsedSeconds) &&
    body.elapsedSeconds >= 1 &&
    body.elapsedSeconds <= 3600
      ? Math.round(body.elapsedSeconds)
      : computedElapsed;

  const maxAttempts = getMaxAttempts(progress.hardMode);

  if (graded.isSolved) {
    progress.status = 'won';
    progress.completedAt = now.toISOString();
    progress.elapsedSeconds = elapsedSeconds;

    const prevStreak = await readStoredStreak(store, actor.userId, todayUtc);
    const updatedStreak = applyStreakWin(
      {
        currentStreak: prevStreak.rawCurrentStreak,
        bestStreak: prevStreak.bestStreak,
        totalSolved: prevStreak.totalSolved,
        lastSolvedDate: prevStreak.lastSolvedDate,
      },
      activeDateKey,
      todayUtc,
    );

    const effectiveStreakNum = getEffectiveCurrentStreak(
      updatedStreak.currentStreak,
      updatedStreak.lastSolvedDate,
      todayUtc,
    );

    const combo = computeSpeedCombo({
      moves: progress.attempts.length,
      elapsedSeconds,
      hintsUsed: progress.hintsUsed,
      currentStreak: effectiveStreakNum,
      hardMode: Boolean(progress.hardMode),
    });
    progress.score = combo.finalKarma;
    progress.comboMultiplier = combo.multiplier;
    progress.comboLabel = combo.tierLabel;

    await store.hSet(streakKey(actor.userId), {
      currentStreak: String(updatedStreak.currentStreak),
      bestStreak: String(updatedStreak.bestStreak),
      totalSolved: String(updatedStreak.totalSolved),
      lastSolvedDate: updatedStreak.lastSolvedDate ?? '',
    });

    const effectiveAfterWin = buildPlayerStreak({
      currentStreak: effectiveStreakNum,
      bestStreak: updatedStreak.bestStreak,
      totalSolved: updatedStreak.totalSolved,
      lastSolvedDate: updatedStreak.lastSolvedDate,
    });

    const moveBucket = Math.max(1, Math.min(MAX_ATTEMPTS, progress.attempts.length));
    await store.hIncrBy(dayStatsKey(activeDateKey), 'totalSolves', 1);
    await store.hIncrBy(dayStatsKey(activeDateKey), 'totalMovesSum', progress.attempts.length);
    await store.hIncrBy(dayStatsKey(activeDateKey), 'totalSecondsSum', elapsedSeconds);
    await store.hIncrBy(dayStatsKey(activeDateKey), `moves_${moveBucket}`, 1);
    if (progress.hardMode) {
      await store.hIncrBy(dayStatsKey(activeDateKey), 'ironSolves', 1);
    }

    const sortKey = computeLeaderboardSortKey({
      moves: progress.attempts.length,
      elapsedSeconds,
      hintsUsed: progress.hintsUsed,
    });
    await store.zAdd(dayLeaderboardKey(activeDateKey), actor.userId, sortKey);

    const lbMeta: StoredLbMeta = {
      username: actor.username,
      moves: progress.attempts.length,
      elapsedSeconds,
      hintsUsed: progress.hintsUsed,
      score: progress.score,
      flairTitle: effectiveAfterWin.flair.title,
      streak: effectiveAfterWin.currentStreak,
      hardMode: Boolean(progress.hardMode),
      completedAt: progress.completedAt,
    };
    await store.hSet(dayLeaderboardMetaKey(activeDateKey), {
      [actor.userId]: JSON.stringify(lbMeta),
    });
  } else if (progress.attempts.length >= maxAttempts) {
    progress.status = 'lost';
    progress.completedAt = now.toISOString();
    progress.elapsedSeconds = elapsedSeconds;
    progress.score = 0;
    await store.hIncrBy(dayStatsKey(activeDateKey), 'losses', 1);
  }

  await store.set(userDayKey(actor.userId, activeDateKey), JSON.stringify(progress));
  return buildGameState(store, bridge, actor, activeDateKey, now);
}

export async function handleHintUnlock(
  store: KvStore,
  bridge: RuntimeBridge,
  actor: RequestActor,
  body: HintRequestBody,
  now: Date = new Date(),
): Promise<GameStateResponse> {
  const todayUtc = getUtcDateKey(now);
  const activeDateKey = resolveDateKey(body.dateKey, todayUtc);
  const { puzzle } = getPuzzleForDate(activeDateKey);

  const progress = await readOrInitDailyProgress(store, actor.userId, activeDateKey, puzzle.id);
  if (progress.status === 'playing' && progress.hintsUsed < puzzle.hints.length) {
    progress.hintsUsed += 1;
    await store.set(userDayKey(actor.userId, activeDateKey), JSON.stringify(progress));
  }

  return buildGameState(store, bridge, actor, activeDateKey, now);
}

export async function handleShareComment(
  store: KvStore,
  bridge: RuntimeBridge,
  actor: RequestActor,
  body: ShareCommentRequestBody,
  now: Date = new Date(),
): Promise<ShareCommentResponse> {
  const state = await buildGameState(store, bridge, actor, body.dateKey, now);
  if (!state.shareMarkdown || state.progress.status === 'playing') {
    throw new Error('Finish forging today’s thread before posting your spoiler-free grid.');
  }

  const delivery = await bridge.submitSpoilerFreeComment({
    postId: actor.postId,
    text: state.shareMarkdown,
    username: actor.username,
  });

  const existingShares = await readRecentShares(store, state.activeDateKey);
  const newItem: SharedCommentItem = {
    id: delivery.commentId ?? `share-${Date.now()}`,
    username: actor.username,
    flairTitle: state.streak.flair.title,
    markdown: state.shareMarkdown,
    postedAt: now.toISOString(),
    source: delivery.postedTo === 'reddit' ? 'reddit' : 'local',
  };

  const deduped = [
    newItem,
    ...existingShares.filter((item) => item.username !== actor.username),
  ].slice(0, 20);
  await store.set(daySharesKey(state.activeDateKey), JSON.stringify(deduped));

  state.progress.sharedToThread = true;
  await store.set(
    userDayKey(actor.userId, state.activeDateKey),
    JSON.stringify(state.progress),
  );

  return {
    ok: true,
    markdown: state.shareMarkdown,
    postedTo: delivery.postedTo,
    commentId: delivery.commentId,
    message: delivery.message,
    recentShares: deduped,
  };
}

export async function buildArchiveList(
  store: KvStore,
  actor: RequestActor,
  now: Date = new Date(),
): Promise<ArchiveResponse> {
  const todayUtc = getUtcDateKey(now);
  const dateKeys = getArchiveDateKeys(todayUtc);

  const editions: ArchiveEditionSummary[] = await Promise.all(
    dateKeys.map(async (dateKey) => {
      const { puzzle, issueNumber } = getPuzzleForDate(dateKey);
      const [rawProgress, stats] = await Promise.all([
        store.get(userDayKey(actor.userId, dateKey)),
        readDailyStats(store, dateKey),
      ]);

      let status: ArchiveEditionSummary['status'] = 'unplayed';
      let movesUsed = 0;
      let hardMode = false;

      if (rawProgress) {
        try {
          const parsed = JSON.parse(rawProgress) as PlayerDailyProgress;
          if (parsed.puzzleId === puzzle.id) {
            movesUsed = parsed.attempts.length;
            hardMode = Boolean(parsed.hardMode);
            status = parsed.attempts.length === 0 && parsed.status === 'playing' ? 'unplayed' : parsed.status;
          }
        } catch {
          status = 'unplayed';
        }
      }

      return {
        issueNumber,
        dateKey,
        puzzleId: puzzle.id,
        category: puzzle.category,
        subreddit: puzzle.subreddit,
        title: puzzle.title,
        difficulty: puzzle.difficulty,
        status,
        hardMode,
        movesUsed,
        communitySolves: stats.totalSolves,
      };
    }),
  );

  return {
    todayUtc,
    editions,
  };
}

// ============================================================================
// Community Forge (UGC Tomorrow's Daily Puzzle Workshop + Upvote Leaderboard)
// ============================================================================

function communityPuzzlesKey(targetDateUtc: string): string {
  return `kf:community:${targetDateUtc}:puzzles`;
}

function communityVotesKey(targetDateUtc: string): string {
  return `kf:community:${targetDateUtc}:votes`;
}

function communityVoterKey(targetDateUtc: string, userId: string): string {
  return `kf:community:${targetDateUtc}:voter:${userId}`;
}

export async function listCommunityPuzzles(
  store: KvStore,
  actor: RequestActor,
  now: Date = new Date(),
): Promise<CommunityForgeListResponse> {
  const todayUtc = getUtcDateKey(now);
  const tomorrowUtc = getTomorrowUtcDateKey(todayUtc);

  const [storedHash, votesHash, userVotesHash] = await Promise.all([
    store.hGetAll(communityPuzzlesKey(tomorrowUtc)),
    store.hGetAll(communityVotesKey(tomorrowUtc)),
    store.hGetAll(communityVoterKey(tomorrowUtc, actor.userId)),
  ]);

  const seeds = buildSeedCommunityNominees(tomorrowUtc);
  const byId = new Map<string, CommunityPuzzleSubmission>();

  for (const seed of seeds) {
    const delta = Number.parseInt(votesHash[seed.id] ?? '0', 10) || 0;
    byId.set(seed.id, {
      ...seed,
      votes: Math.max(0, seed.votes + delta),
      hasVoted: userVotesHash[seed.id] === '1',
    });
  }

  for (const [id, raw] of Object.entries(storedHash)) {
    try {
      const parsed = JSON.parse(raw) as CommunityPuzzleSubmission;
      if (!parsed || !parsed.id || !parsed.title) continue;
      const storedVotes = Number.parseInt(votesHash[id] ?? String(parsed.votes ?? 1), 10);
      byId.set(id, {
        ...parsed,
        votes: Number.isFinite(storedVotes) ? Math.max(0, storedVotes) : 1,
        hasVoted: userVotesHash[id] === '1',
      });
    } catch {
      // Ignore malformed stored item gracefully.
    }
  }

  const sorted = sortCommunitySubmissions(Array.from(byId.values()));
  const totalVotes = sorted.reduce((acc, item) => acc + item.votes, 0);

  return {
    tomorrowUtc,
    items: sorted,
    totalSubmissions: sorted.length,
    totalVotes,
    leadingId: sorted[0]?.id ?? null,
  };
}

export async function createCommunityPuzzle(
  store: KvStore,
  actor: RequestActor,
  draft: CommunityForgeDraftInput,
  now: Date = new Date(),
): Promise<CommunityForgeCreateResponse> {
  const validation = validateCommunityPuzzleDraft(draft);
  if (!validation.ok) {
    throw new Error(validation.errors[0] ?? 'Please complete all required Community Forge fields.');
  }

  const clean = sanitizeCommunityDraft(draft);
  const todayUtc = getUtcDateKey(now);
  const tomorrowUtc = getTomorrowUtcDateKey(todayUtc);
  const uniqueSuffix = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const id = `cf-${uniqueSuffix}`;

  const submission: CommunityPuzzleSubmission = {
    id,
    title: clean.title,
    category: clean.category,
    subreddit: clean.subreddit,
    difficulty: clean.difficulty,
    authorUsername: actor.username,
    createdAt: now.toISOString(),
    targetDateUtc: tomorrowUtc,
    openingPost: {
      subreddit: clean.subreddit,
      author: actor.username,
      flair: 'Community OP',
      upvotes: '1',
      title: clean.openingTitle,
      excerpt: clean.openingExcerpt,
    },
    finalePost: {
      subreddit: clean.subreddit,
      author: actor.username,
      flair: 'Community Finale',
      upvotes: '1',
      title: clean.finaleTitle,
      excerpt: clean.finaleExcerpt,
    },
    links: clean.links,
    trolls: clean.trolls,
    hintText: clean.hintText,
    votes: 1,
    hasVoted: true,
    isCuratedSeed: false,
  };

  await Promise.all([
    store.hSet(communityPuzzlesKey(tomorrowUtc), { [id]: JSON.stringify(submission) }),
    store.hSet(communityVotesKey(tomorrowUtc), { [id]: '1' }),
    store.hSet(communityVoterKey(tomorrowUtc, actor.userId), { [id]: '1' }),
  ]);

  const queue = await listCommunityPuzzles(store, actor, now);
  return {
    ok: true,
    submission,
    queue,
  };
}

export async function toggleCommunityVote(
  store: KvStore,
  actor: RequestActor,
  body: CommunityVoteRequestBody,
  now: Date = new Date(),
): Promise<CommunityVoteResponse> {
  const puzzleId = typeof body.puzzleId === 'string' ? body.puzzleId.trim() : '';
  if (!puzzleId) {
    throw new Error('Missing puzzleId to cast upvote.');
  }

  const todayUtc = getUtcDateKey(now);
  const tomorrowUtc = getTomorrowUtcDateKey(todayUtc);

  const currentQueue = await listCommunityPuzzles(store, actor, now);
  const target = currentQueue.items.find((item) => item.id === puzzleId);
  if (!target) {
    throw new Error(`Community puzzle "${puzzleId}" was not found in tomorrow's queue.`);
  }

  const voterKey = communityVoterKey(tomorrowUtc, actor.userId);
  const votesKey = communityVotesKey(tomorrowUtc);
  const userVotes = await store.hGetAll(voterKey);
  const alreadyVoted = userVotes[puzzleId] === '1';

  const delta = alreadyVoted ? -1 : 1;
  await Promise.all([
    store.hIncrBy(votesKey, puzzleId, delta),
    store.hSet(voterKey, { [puzzleId]: alreadyVoted ? '0' : '1' }),
  ]);

  const refreshed = await listCommunityPuzzles(store, actor, now);
  const updatedTarget = refreshed.items.find((item) => item.id === puzzleId);

  return {
    ok: true,
    puzzleId,
    votes: updatedTarget?.votes ?? Math.max(0, target.votes + delta),
    hasVoted: !alreadyVoted,
    queue: refreshed,
  };
}
