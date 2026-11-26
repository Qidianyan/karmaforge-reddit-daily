import type {
  AttemptRecord,
  CrowdConsensusBucket,
  CrowdConsensusSummary,
  GameStatus,
  GradedSlot,
  MoveDistribution,
  PuzzleDefinition,
  PuzzleDifficulty,
  SlotVerdict,
  SpeedComboBreakdown,
} from './types.js';
import { CARD_POOL_SIZE, IRON_FORGE_MAX_ATTEMPTS, MAX_ATTEMPTS, SLOT_COUNT } from './types.js';

export function getMaxAttempts(hardMode?: boolean): number {
  return hardMode ? IRON_FORGE_MAX_ATTEMPTS : MAX_ATTEMPTS;
}

export const EMPTY_MOVE_DISTRIBUTION: MoveDistribution = {
  moves1: 0,
  moves2: 0,
  moves3: 0,
  moves4: 0,
  moves5: 0,
  losses: 0,
};

/**
 * Validates Iron Forge (Hard Mode) clue discipline on subsequent attempts:
 * 1) Previously locked Exact slots must stay in place.
 * 2) Previously revealed Misplaced bridge links must be reused and moved out of rejected slots.
 * 3) Previously exposed Red Herrings cannot be replayed.
 */
export function validateIronForgeConstraints(
  attempts: AttemptRecord[],
  nextCardIds: string[],
): string | null {
  if (attempts.length === 0) {
    return null;
  }
  const known = extractKnownCardStatuses(attempts);
  const nextSet = new Set(nextCardIds);

  for (let idx = 0; idx < SLOT_COUNT; idx += 1) {
    const lockedId = known.lockedSlots[idx];
    if (lockedId && nextCardIds[idx] !== lockedId) {
      return `Iron Forge rule: Keep confirmed Exact link locked in Slot #${idx + 1}.`;
    }
  }

  for (const id of nextCardIds) {
    if (known.knownWrongIds.has(id)) {
      return 'Iron Forge rule: Eliminated Red Herrings cannot be replayed.';
    }
  }

  for (const [cardId, rejectedSlots] of Object.entries(known.misplacedSlotsByCard)) {
    const alreadyLocked = known.lockedSlots.includes(cardId);
    if (alreadyLocked) continue;

    if (!nextSet.has(cardId)) {
      return 'Iron Forge rule: Every revealed Misplaced bridge link must stay in your chain.';
    }
    const newSlotIdx = nextCardIds.indexOf(cardId);
    if (rejectedSlots.includes(newSlotIdx)) {
      return `Iron Forge rule: Move that Misplaced link out of rejected Slot #${newSlotIdx + 1}.`;
    }
  }

  return null;
}

export interface GradeResult {
  slots: [GradedSlot, GradedSlot, GradedSlot, GradedSlot];
  exactCount: number;
  misplacedCount: number;
  wrongCount: number;
  isSolved: boolean;
}

/**
 * Validates that a player submitted 4 unique card IDs belonging to the active puzzle.
 */
export function validateSubmissionCardIds(puzzle: PuzzleDefinition, cardIds: string[]): string | null {
  if (!Array.isArray(cardIds) || cardIds.length !== SLOT_COUNT) {
    return `You must place exactly ${SLOT_COUNT} bridge cards before forging the thread.`;
  }
  const validIds = new Set(puzzle.cards.map((c) => c.id));
  const seen = new Set<string>();
  for (const id of cardIds) {
    if (typeof id !== 'string' || !validIds.has(id)) {
      return `Unknown bridge card "${String(id)}" for puzzle ${puzzle.id}.`;
    }
    if (seen.has(id)) {
      return 'Each bridge card can only occupy one thread slot.';
    }
    seen.add(id);
  }
  return null;
}

/**
 * Grades a 4-card submission against the puzzle's unique ordered solution.
 * - exact: card is part of the chain AND in the exact link position.
 * - misplaced: card is part of the chain, but belongs in a different slot.
 * - wrong: card is one of the 2 off-topic red herrings.
 */
export function gradeAttempt(puzzle: PuzzleDefinition, cardIds: string[]): GradeResult {
  const err = validateSubmissionCardIds(puzzle, cardIds);
  if (err) {
    throw new Error(err);
  }

  const solutionSet = new Set<string>(puzzle.solutionIds);
  const graded: GradedSlot[] = cardIds.map((cardId, idx) => {
    let verdict: SlotVerdict;
    if (puzzle.solutionIds[idx] === cardId) {
      verdict = 'exact';
    } else if (solutionSet.has(cardId)) {
      verdict = 'misplaced';
    } else {
      verdict = 'wrong';
    }
    return { cardId, verdict };
  });

  const exactCount = graded.filter((s) => s.verdict === 'exact').length;
  const misplacedCount = graded.filter((s) => s.verdict === 'misplaced').length;
  const wrongCount = graded.filter((s) => s.verdict === 'wrong').length;

  return {
    slots: graded as [GradedSlot, GradedSlot, GradedSlot, GradedSlot],
    exactCount,
    misplacedCount,
    wrongCount,
    isSolved: exactCount === SLOT_COUNT,
  };
}

/**
 * Computes Karma score (higher is better) for a victorious daily solve.
 * Max score: 1000 (1st try, <=30s, 0 hints).
 */
export function computeSolveScore(params: {
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
}): number {
  const clampedMoves = Math.max(1, Math.min(MAX_ATTEMPTS, params.moves));
  const baseByMoves = 1000 - (clampedMoves - 1) * 140;
  const speedPenalty = Math.min(120, Math.max(0, Math.floor((params.elapsedSeconds - 25) / 3)));
  const hintPenalty = Math.max(0, params.hintsUsed) * 75;
  return Math.max(150, baseByMoves - speedPenalty - hintPenalty);
}

/**
 * Computes Speed Combo Multiplier & Streak-boosted Karma for live HUD & share cards.
 */
export function computeSpeedCombo(params: {
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  currentStreak: number;
  hardMode?: boolean;
}): SpeedComboBreakdown {
  const baseScore = computeSolveScore(params);
  let speedMult = 1.0;
  let tierLabel = 'Steady Link';

  if (params.elapsedSeconds <= 25 && params.moves <= 2) {
    speedMult = 2.0;
    tierLabel = 'Flash Forge';
  } else if (params.elapsedSeconds <= 45) {
    speedMult = 1.5;
    tierLabel = 'Speed Runner';
  } else if (params.elapsedSeconds <= 75) {
    speedMult = 1.25;
    tierLabel = 'Sharp Thread';
  }

  const streakBonusPct = Math.min(50, Math.max(0, params.currentStreak) * 5);
  const ironMult = params.hardMode ? 1.25 : 1.0;
  const combinedMult = Number((speedMult * (1 + streakBonusPct / 100) * ironMult).toFixed(2));
  const finalKarma = Math.round(baseScore * combinedMult);

  return {
    multiplier: combinedMult,
    tierLabel: params.hardMode ? `Iron ${tierLabel}` : tierLabel,
    baseScore,
    streakBonusPct,
    finalKarma,
  };
}

/**
 * Composite ascending rank score for Redis sorted set leaderboards:
 * primary sort = Iron Forge ahead of Standard, then fewer moves, faster time, fewer hints.
 */
export function computeLeaderboardSortKey(params: {
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  hardMode?: boolean;
}): number {
  const modeBand = params.hardMode ? 0 : 1;
  const moves = Math.max(1, Math.min(MAX_ATTEMPTS, params.moves));
  const secs = Math.max(1, Math.min(86399, Math.round(params.elapsedSeconds)));
  const hints = Math.max(0, Math.min(9, params.hintsUsed));
  return modeBand * 10_000_000 + moves * 1_000_000 + secs * 10 + hints;
}

/**
 * Computes UTC day difference (dateB - dateA) in whole calendar days.
 */
export function diffUtcDays(dateA: string, dateB: string): number {
  const msA = Date.parse(`${dateA}T00:00:00.000Z`);
  const msB = Date.parse(`${dateB}T00:00:00.000Z`);
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Rolls over a player's streak cleanly when they solve `solvedDateKey`.
 * - Solving an archive puzzle older than today does not break or advance today's live streak,
 *   except incrementing totalSolved.
 * - Solving today consecutively after yesterday increments currentStreak.
 * - Solving today twice is idempotent.
 */
export function applyStreakWin(
  prev: { currentStreak: number; bestStreak: number; totalSolved: number; lastSolvedDate: string | null },
  solvedDateKey: string,
  todayUtc: string,
): { currentStreak: number; bestStreak: number; totalSolved: number; lastSolvedDate: string | null } {
  const totalSolved = prev.totalSolved + 1;

  // Archive solve (not today's live daily): keep streak intact, count total solves.
  if (solvedDateKey !== todayUtc) {
    return {
      currentStreak: prev.currentStreak,
      bestStreak: prev.bestStreak,
      totalSolved,
      lastSolvedDate: prev.lastSolvedDate,
    };
  }

  // Already counted today.
  if (prev.lastSolvedDate === todayUtc) {
    return {
      currentStreak: prev.currentStreak,
      bestStreak: prev.bestStreak,
      totalSolved: prev.totalSolved,
      lastSolvedDate: prev.lastSolvedDate,
    };
  }

  let nextStreak = 1;
  if (prev.lastSolvedDate !== null) {
    const gap = diffUtcDays(prev.lastSolvedDate, todayUtc);
    if (gap === 1) {
      nextStreak = prev.currentStreak + 1;
    } else if (gap === 0) {
      nextStreak = Math.max(1, prev.currentStreak);
    } else {
      nextStreak = 1;
    }
  }

  return {
    currentStreak: nextStreak,
    bestStreak: Math.max(prev.bestStreak, nextStreak),
    totalSolved,
    lastSolvedDate: todayUtc,
  };
}

/**
 * Returns the live displayed streak on `todayUtc` (resets to 0 if player missed yesterday).
 */
export function getEffectiveCurrentStreak(
  storedStreak: number,
  lastSolvedDate: string | null,
  todayUtc: string,
): number {
  if (!lastSolvedDate || storedStreak <= 0) {
    return 0;
  }
  const gap = diffUtcDays(lastSolvedDate, todayUtc);
  return gap <= 1 && gap >= 0 ? storedStreak : 0;
}

/**
 * Sanity helper verifying puzzle definition structural invariants.
 */
export function verifyPuzzleIntegrity(puzzle: PuzzleDefinition): string[] {
  const errors: string[] = [];
  if (puzzle.cards.length !== CARD_POOL_SIZE) {
    errors.push(`${puzzle.id}: expected ${CARD_POOL_SIZE} cards, got ${puzzle.cards.length}`);
  }
  if (puzzle.solutionIds.length !== SLOT_COUNT) {
    errors.push(`${puzzle.id}: expected ${SLOT_COUNT} solutionIds, got ${puzzle.solutionIds.length}`);
  }
  const cardIds = new Set(puzzle.cards.map((c) => c.id));
  if (cardIds.size !== CARD_POOL_SIZE) {
    errors.push(`${puzzle.id}: duplicate card IDs detected`);
  }
  const solSet = new Set(puzzle.solutionIds);
  if (solSet.size !== SLOT_COUNT) {
    errors.push(`${puzzle.id}: duplicate solutionIds detected`);
  }
  for (const sid of puzzle.solutionIds) {
    const card = puzzle.cards.find((c) => c.id === sid);
    if (!card) {
      errors.push(`${puzzle.id}: solutionId ${sid} missing from cards`);
    } else if (card.isRedHerring) {
      errors.push(`${puzzle.id}: solutionId ${sid} is mistakenly flagged isRedHerring=true`);
    }
  }
  const redHerrings = puzzle.cards.filter((c) => c.isRedHerring);
  if (redHerrings.length !== CARD_POOL_SIZE - SLOT_COUNT) {
    errors.push(`${puzzle.id}: expected 2 red herrings, got ${redHerrings.length}`);
  }
  if (puzzle.hints.length !== 2) {
    errors.push(`${puzzle.id}: expected 2 progressive hints, got ${puzzle.hints.length}`);
  }
  return errors;
}

export function extractKnownCardStatuses(attempts: AttemptRecord[]): {
  lockedSlots: (string | null)[];
  knownWrongIds: Set<string>;
  misplacedSlotsByCard: Record<string, number[]>;
} {
  const lockedSlots: (string | null)[] = [null, null, null, null];
  const knownWrongIds = new Set<string>();
  const misplacedSlotsByCard: Record<string, number[]> = {};

  for (const attempt of attempts) {
    attempt.slots.forEach((slot, idx) => {
      if (slot.verdict === 'exact') {
        lockedSlots[idx] = slot.cardId;
      } else if (slot.verdict === 'wrong') {
        knownWrongIds.add(slot.cardId);
      } else if (slot.verdict === 'misplaced') {
        const list = misplacedSlotsByCard[slot.cardId] ?? [];
        if (!list.includes(idx)) {
          list.push(idx);
        }
        misplacedSlotsByCard[slot.cardId] = list;
      }
    });
  }

  return { lockedSlots, knownWrongIds, misplacedSlotsByCard };
}

/**
 * Calibrated Dirichlet cold-start priors (N0 = 40) by puzzle difficulty tier.
 * Blended deterministically with real Redis move counts — zero random jitter.
 */
const CROWD_PRIORS_BY_DIFFICULTY: Record<
  PuzzleDifficulty,
  readonly [number, number, number, number, number, number]
> = {
  Mild: [7, 15, 11, 4, 2, 1],
  Spicy: [4, 11, 13, 7, 3, 2],
  'Galaxy Brain': [2, 7, 12, 10, 5, 4],
};

const BUCKET_META: ReadonlyArray<{ key: CrowdConsensusBucket['key']; label: string }> = [
  { key: '1', label: '1 Move' },
  { key: '2', label: '2 Moves' },
  { key: '3', label: '3 Moves' },
  { key: '4', label: '4 Moves' },
  { key: '5', label: '5 Moves' },
  { key: 'X', label: 'Locked' },
];

function safeNonNegInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Computes Global Crowd Consensus move histogram & deterministic "Sharper than XX% of r/KarmaForge"
 * percentile by blending real Redis telemetry with calibrated cold-start priors.
 */
export function computeCrowdConsensus(params: {
  difficulty: PuzzleDifficulty;
  liveDistribution?: MoveDistribution;
  ironForgeSolves?: number;
  playerStatus: GameStatus;
  playerMoves: number;
  playerElapsedSeconds: number | null;
  playerHardMode?: boolean;
}): CrowdConsensusSummary {
  const prior = CROWD_PRIORS_BY_DIFFICULTY[params.difficulty] ?? CROWD_PRIORS_BY_DIFFICULTY.Spicy;
  const dist = params.liveDistribution ?? EMPTY_MOVE_DISTRIBUTION;
  const liveCounts = [
    safeNonNegInt(dist.moves1),
    safeNonNegInt(dist.moves2),
    safeNonNegInt(dist.moves3),
    safeNonNegInt(dist.moves4),
    safeNonNegInt(dist.moves5),
    safeNonNegInt(dist.losses),
  ];

  const priorSampleSize = prior.reduce((acc, v) => acc + v, 0);
  const liveSampleSize = liveCounts.reduce((acc, v) => acc + v, 0);
  const blended = prior.map((p, idx) => p + (liveCounts[idx] ?? 0));
  const totalBlended = Math.max(1, blended.reduce((acc, v) => acc + v, 0));

  const safeMoves = Number.isFinite(params.playerMoves) ? Math.round(params.playerMoves) : 1;
  const playerBucketIdx =
    params.playerStatus === 'won'
      ? Math.max(0, Math.min(4, safeMoves - 1))
      : params.playerStatus === 'lost'
        ? 5
        : -1;

  const buckets: CrowdConsensusBucket[] = BUCKET_META.map((meta, idx) => {
    const count = blended[idx] ?? 0;
    return {
      key: meta.key,
      label: meta.label,
      count,
      liveCount: liveCounts[idx] ?? 0,
      pct: Math.round((count / totalBlended) * 100),
      isPlayerBucket: idx === playerBucketIdx,
    };
  });

  let sharperThanPct = 0;
  let headline: string;

  if (params.playerStatus === 'won' && playerBucketIdx >= 0 && playerBucketIdx <= 4) {
    let worseCount = 0;
    for (let idx = playerBucketIdx + 1; idx < blended.length; idx += 1) {
      worseCount += blended[idx] ?? 0;
    }
    const rawElapsed =
      typeof params.playerElapsedSeconds === 'number' && Number.isFinite(params.playerElapsedSeconds)
        ? params.playerElapsedSeconds
        : 45;
    const clampedElapsed = Math.max(5, Math.min(120, rawElapsed));
    const ironTieBoost = params.playerHardMode ? 0.12 : 0;
    const withinBucketFraction = Math.max(
      0.15,
      Math.min(0.85, 0.5 + (45 - clampedElapsed) / 140 + ironTieBoost),
    );
    const rawPct =
      ((worseCount + (blended[playerBucketIdx] ?? 0) * withinBucketFraction) / totalBlended) * 100;
    sharperThanPct = Math.max(1, Math.min(99, Math.round(rawPct)));
    headline = `Sharper than ${sharperThanPct}% of r/KarmaForge`;
  } else {
    const solveRatePct = Math.round(((totalBlended - (blended[5] ?? 0)) / totalBlended) * 100);
    headline = `${solveRatePct}% of r/KarmaForge forged today’s chain`;
  }

  return {
    buckets,
    sharperThanPct,
    headline,
    liveSampleSize,
    priorSampleSize,
    ironForgeSolves: safeNonNegInt(params.ironForgeSolves),
  };
}

export const MICRO_GUIDE_STORAGE_KEY = 'karmaforge:micro_guide_dismissed:v1';

export function shouldShowMicroGuide(params: {
  dismissed: boolean;
  isPlaying: boolean;
  activeTab: 'daily' | 'community';
  attemptsCount: number;
  placedCount: number;
}): boolean {
  return (
    !params.dismissed &&
    params.isPlaying &&
    params.activeTab === 'daily' &&
    params.attemptsCount === 0 &&
    params.placedCount === 0
  );
}
