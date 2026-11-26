import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CARD_POOL_SIZE,
  COLLECTIBLE_BADGES,
  FLAIR_TIERS,
  IRON_FORGE_MAX_ATTEMPTS,
  MICRO_GUIDE_STORAGE_KEY,
  PUZZLES,
  QUICK_FORGE_PRESETS,
  SLOT_COUNT,
  addUtcDays,
  applyStreakWin,
  buildPlayerStreak,
  buildSeedCommunityNominees,
  computeCrowdConsensus,
  computeLeaderboardSortKey,
  computeSolveScore,
  computeSpeedCombo,
  generateSpoilerFreeShareMarkdown,
  getArchiveDateKeys,
  getEffectiveCurrentStreak,
  getFlairForStreak,
  getMaxAttempts,
  getPuzzleForDate,
  getTomorrowUtcDateKey,
  gradeAttempt,
  normalizeSubredditName,
  shouldShowMicroGuide,
  sortCommunitySubmissions,
  toPublicPuzzlePayload,
  validateCommunityPuzzleDraft,
  validateIronForgeConstraints,
  verifyPuzzleIntegrity,
} from '../src/shared/index.js';
import { createKarmaForgeApp } from '../src/server/app.js';
import {
  buildArchiveList,
  buildGameState,
  createCommunityPuzzle,
  handleGuessSubmission,
  handleHintUnlock,
  handleShareComment,
  listCommunityPuzzles,
  toggleCommunityVote,
} from '../src/server/service.js';
import { FileBackedKvStore } from '../src/server/storage.js';
import type { RequestActor, RuntimeBridge } from '../src/server/storage.js';
import {
  playAttemptFeedback,
  playKeyClick,
  playToggleChime,
  playVictoryChord,
} from '../src/client/sound.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function makeTestBridge(actor: RequestActor): RuntimeBridge {
  return {
    runtimeMode: 'local',
    async getRequestActor() {
      return actor;
    },
    async submitSpoilerFreeComment() {
      return {
        postedTo: 'local',
        commentId: 't1_comment01',
        message: 'Posted!',
      };
    },
  };
}

describe('KarmaForge · 60 Handcrafted Puzzles Integrity', () => {
  it('contains exactly 60 unique, structurally valid puzzles across all 8 categories', () => {
    expect(PUZZLES).toHaveLength(60);

    const ids = new Set<string>();
    const titles = new Set<string>();
    const categories = new Set<string>();

    for (let idx = 0; idx < PUZZLES.length; idx += 1) {
      const puzzle = PUZZLES[idx]!;
      const errors = verifyPuzzleIntegrity(puzzle);
      expect(errors, `Puzzle ${puzzle.id} errors: ${errors.join('; ')}`).toEqual([]);

      expect(puzzle.number).toBe(idx + 1);
      expect(ids.has(puzzle.id)).toBe(false);
      ids.add(puzzle.id);

      expect(titles.has(puzzle.title)).toBe(false);
      titles.add(puzzle.title);

      categories.add(puzzle.category);

      expect(puzzle.openingPost.title.length).toBeGreaterThan(15);
      expect(puzzle.finalePost.title.length).toBeGreaterThan(15);

      for (const card of puzzle.cards) {
        expect(card.title.length).toBeGreaterThan(10);
        expect(card.summary.length).toBeGreaterThan(15);
        expect(card.debrief.length).toBeGreaterThan(15);
      }

      for (const hint of puzzle.hints) {
        expect(hint.author.startsWith('u/')).toBe(true);
        expect(hint.text.length).toBeGreaterThan(15);
      }
    }

    expect(categories.size).toBe(8);
  });

  it('verifies all 60 puzzles are 100% solvable with unique global card IDs, valid r/ subreddits, and clean text', () => {
    const validCategories = new Set([
      'Science',
      'Retro Tech',
      'Cooking',
      'Cinema',
      'Worldbuilding',
      'Nature',
      'History',
      'Internet Culture',
    ]);
    const validDifficulties = new Set(['Mild', 'Spicy', 'Galaxy Brain']);
    const globalCardIds = new Set<string>();
    const globalCardTitles = new Set<string>();
    const controlOrReplacement = /[\u0000-\u001f\ufffd]/;

    for (const puzzle of PUZZLES) {
      expect(validCategories.has(puzzle.category)).toBe(true);
      expect(validDifficulties.has(puzzle.difficulty)).toBe(true);
      expect(puzzle.subreddit.startsWith('r/')).toBe(true);
      expect(puzzle.openingPost.subreddit.startsWith('r/')).toBe(true);
      expect(puzzle.openingPost.author.startsWith('u/')).toBe(true);
      expect(puzzle.finalePost.subreddit.startsWith('r/')).toBe(true);
      expect(puzzle.finalePost.author.startsWith('u/')).toBe(true);

      const solved = gradeAttempt(puzzle, [...puzzle.solutionIds]);
      expect(solved.isSolved).toBe(true);
      expect(solved.exactCount).toBe(SLOT_COUNT);
      expect(solved.misplacedCount).toBe(0);
      expect(solved.wrongCount).toBe(0);

      for (const field of [
        puzzle.title,
        puzzle.openingPost.title,
        puzzle.openingPost.excerpt,
        puzzle.finalePost.title,
        puzzle.finalePost.excerpt,
      ]) {
        expect(field.trim().length).toBeGreaterThan(10);
        expect(controlOrReplacement.test(field)).toBe(false);
      }

      for (const card of puzzle.cards) {
        expect(globalCardIds.has(card.id)).toBe(false);
        globalCardIds.add(card.id);
        expect(globalCardTitles.has(card.title.toLowerCase())).toBe(false);
        globalCardTitles.add(card.title.toLowerCase());
        expect(card.subreddit.startsWith('r/')).toBe(true);
        for (const text of [card.tag, card.title, card.summary, card.debrief]) {
          expect(text.trim().length).toBeGreaterThanOrEqual(3);
          expect(controlOrReplacement.test(text)).toBe(false);
        }
      }
    }

    expect(globalCardIds.size).toBe(60 * CARD_POOL_SIZE);
  });
});

describe('KarmaForge · Deterministic 365-Day UTC Calendar & Shuffling', () => {
  it('maps every day of 2026 deterministically with zero repeats across any 60-day archive window', () => {
    const start = '2026-01-01';

    for (let i = 0; i < 365; i += 1) {
      const dateKey = addUtcDays(start, i);
      const first = getPuzzleForDate(dateKey);
      const second = getPuzzleForDate(dateKey);

      expect(first.puzzle.id).toBe(second.puzzle.id);
      expect(first.issueNumber).toBe(i + 1);

      const pubA = toPublicPuzzlePayload(first.puzzle, dateKey, first.issueNumber);
      const pubB = toPublicPuzzlePayload(first.puzzle, dateKey, first.issueNumber);
      expect(pubA.cards.map((c) => c.id)).toEqual(pubB.cards.map((c) => c.id));
      expect(pubA.cards).toHaveLength(CARD_POOL_SIZE);
      const startsSolved = first.puzzle.solutionIds.every((id, idx) => pubA.cards[idx]?.id === id);
      expect(startsSolved).toBe(false);
    }

    for (const anchor of ['2026-03-01', '2026-06-15', '2026-11-24', '2026-12-31']) {
      const archiveDates = getArchiveDateKeys(anchor);
      expect(archiveDates).toHaveLength(60);
      const uniqueIds = new Set(archiveDates.map((d) => getPuzzleForDate(d).puzzle.id));
      expect(uniqueIds.size).toBe(60);
    }
  });
});

describe('KarmaForge · Grading Engine & Speed Combo Multiplier', () => {
  const samplePuzzle = PUZZLES[0]!;
  const [s0, s1, s2, s3] = samplePuzzle.solutionIds;
  const redHerrings = samplePuzzle.cards.filter((c) => c.isRedHerring).map((c) => c.id);
  const [t0, t1] = redHerrings as [string, string];

  it('grades exact, misplaced, and wrong (red herring) slots accurately', () => {
    const mixed = gradeAttempt(samplePuzzle, [s0, s2, t0, s3]);
    expect(mixed.isSolved).toBe(false);
    expect(mixed.exactCount).toBe(2);
    expect(mixed.misplacedCount).toBe(1);
    expect(mixed.wrongCount).toBe(1);
    expect(mixed.slots.map((s) => s.verdict)).toEqual(['exact', 'misplaced', 'wrong', 'exact']);

    const win = gradeAttempt(samplePuzzle, [s0, s1, s2, s3]);
    expect(win.isSolved).toBe(true);
    expect(win.exactCount).toBe(SLOT_COUNT);
    expect(win.misplacedCount).toBe(0);
    expect(win.wrongCount).toBe(0);
  });

  it('rejects duplicate, short, or unknown card submissions', () => {
    expect(() => gradeAttempt(samplePuzzle, [s0, s1, s2])).toThrow();
    expect(() => gradeAttempt(samplePuzzle, [s0, s0, s2, s3])).toThrow();
    expect(() => gradeAttempt(samplePuzzle, [s0, s1, t1, 'unknown-id'])).toThrow();
  });

  it('orders leaderboard composite sort keys by moves first, then speed, then hints', () => {
    const oneMoveSlow = computeLeaderboardSortKey({ moves: 1, elapsedSeconds: 95, hintsUsed: 0 });
    const twoMovesFast = computeLeaderboardSortKey({ moves: 2, elapsedSeconds: 18, hintsUsed: 0 });
    const twoMovesSlower = computeLeaderboardSortKey({ moves: 2, elapsedSeconds: 45, hintsUsed: 0 });
    expect(oneMoveSlow).toBeLessThan(twoMovesFast);
    expect(twoMovesFast).toBeLessThan(twoMovesSlower);
    expect(computeSolveScore({ moves: 1, elapsedSeconds: 20, hintsUsed: 0 })).toBe(1000);
  });

  it('computes tiered Speed Combo multipliers and caps streak bonus cleanly at 50%', () => {
    const flash = computeSpeedCombo({ moves: 1, elapsedSeconds: 20, hintsUsed: 0, currentStreak: 0 });
    expect(flash.tierLabel).toBe('Flash Forge');
    expect(flash.multiplier).toBe(2.0);
    expect(flash.finalKarma).toBe(2000);

    const speedRunner = computeSpeedCombo({ moves: 2, elapsedSeconds: 40, hintsUsed: 0, currentStreak: 4 });
    expect(speedRunner.tierLabel).toBe('Speed Runner');
    expect(speedRunner.streakBonusPct).toBe(20);
    expect(speedRunner.multiplier).toBe(1.8);

    const capped = computeSpeedCombo({ moves: 3, elapsedSeconds: 95, hintsUsed: 1, currentStreak: 30 });
    expect(capped.tierLabel).toBe('Steady Link');
    expect(capped.streakBonusPct).toBe(50);
    expect(capped.multiplier).toBe(1.5);
  });
});

describe('KarmaForge · Streaks, Pixel Badges & Spoiler-Free Share Card', () => {
  it('advances consecutive streaks, stays idempotent on same day, protects archive solves, and resets after missed day', () => {
    const d1 = applyStreakWin(
      { currentStreak: 0, bestStreak: 0, totalSolved: 0, lastSolvedDate: null },
      '2026-11-20',
      '2026-11-20',
    );
    expect(d1).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      totalSolved: 1,
      lastSolvedDate: '2026-11-20',
    });

    const d1Again = applyStreakWin(d1, '2026-11-20', '2026-11-20');
    expect(d1Again).toEqual(d1);

    const d2 = applyStreakWin(d1, '2026-11-21', '2026-11-21');
    expect(d2.currentStreak).toBe(2);
    expect(d2.bestStreak).toBe(2);
    expect(d2.totalSolved).toBe(2);

    const archiveSolve = applyStreakWin(d2, '2026-11-10', '2026-11-21');
    expect(archiveSolve.currentStreak).toBe(2);
    expect(archiveSolve.totalSolved).toBe(3);

    expect(getEffectiveCurrentStreak(d2.currentStreak, d2.lastSolvedDate, '2026-11-23')).toBe(0);
    const resetWin = applyStreakWin(d2, '2026-11-23', '2026-11-23');
    expect(resetWin.currentStreak).toBe(1);
    expect(resetWin.bestStreak).toBe(2);
  });

  it('unlocks all 5 Reddit community flair tiers and maps all 3 retro pixel badges on disk', () => {
    expect(getFlairForStreak(0).title).toBe('Fresh Account');
    expect(getFlairForStreak(1).title).toBe('Lurker');
    expect(getFlairForStreak(1).artPath).toBe('./art/badge_lurker.png');
    expect(getFlairForStreak(3).title).toBe('Commenter');
    expect(getFlairForStreak(7).title).toBe('Thread Weaver');
    expect(getFlairForStreak(7).artPath).toBe('./art/badge_weaver.png');
    expect(getFlairForStreak(14).title).toBe('Mod Favorite');
    expect(getFlairForStreak(30).title).toBe('Front Page Sage');
    expect(getFlairForStreak(30).artPath).toBe('./art/badge_sage.png');
    expect(FLAIR_TIERS).toHaveLength(5);
    expect(COLLECTIBLE_BADGES).toHaveLength(3);

    for (const badge of COLLECTIBLE_BADGES) {
      const diskPath = path.join(projectRoot, 'public', badge.artPath.replace(/^\.\//, ''));
      expect(fs.existsSync(diskPath), `Missing pixel badge asset: ${diskPath}`).toBe(true);
      expect(fs.statSync(diskPath).size).toBeGreaterThan(2048);
    }
  });

  it('generates clean spoiler-free Reddit markdown with combo tier and zero card title leaks', () => {
    const puzzle = PUZZLES[4]!;
    const pub = toPublicPuzzlePayload(puzzle, '2026-11-24', 42);
    const red = puzzle.cards.find((c) => c.isRedHerring)!;
    const g1 = gradeAttempt(puzzle, [
      puzzle.solutionIds[0],
      puzzle.solutionIds[2],
      red.id,
      puzzle.solutionIds[3],
    ]);
    const g2 = gradeAttempt(puzzle, [...puzzle.solutionIds]);
    const streak = buildPlayerStreak({
      currentStreak: 7,
      bestStreak: 7,
      totalSolved: 7,
      lastSolvedDate: '2026-11-24',
    });

    const md = generateSpoilerFreeShareMarkdown({
      puzzle: pub,
      status: 'won',
      attempts: [
        {
          attemptNumber: 1,
          slots: g1.slots,
          exactCount: g1.exactCount,
          misplacedCount: g1.misplacedCount,
          wrongCount: g1.wrongCount,
          submittedAt: '2026-11-24T08:00:00.000Z',
        },
        {
          attemptNumber: 2,
          slots: g2.slots,
          exactCount: g2.exactCount,
          misplacedCount: g2.misplacedCount,
          wrongCount: g2.wrongCount,
          submittedAt: '2026-11-24T08:00:34.000Z',
        },
      ],
      elapsedSeconds: 34,
      hintsUsed: 0,
      streak,
    });

    expect(md).toContain('KarmaForge #042');
    expect(md).toContain('2/5 moves');
    expect(md).toContain('7-day streak');
    expect(md).toContain('Thread Weaver');
    expect(md).toContain('Speed Runner');
    expect(md).toContain('Karma');
    expect(md).toContain('🟩🟨⬛🟩');
    expect(md).toContain('🟩🟩🟩🟩');

    for (const card of puzzle.cards) {
      expect(md).not.toContain(card.title);
      expect(md).not.toContain(card.id);
    }
  });
});

describe('KarmaForge · Community Forge (UGC Creation & Tomorrow Vote Queue)', () => {
  it('validates all built-in Quick Forge blueprints as 100% ready and normalizes subreddits', () => {
    expect(QUICK_FORGE_PRESETS.length).toBeGreaterThanOrEqual(2);
    for (const preset of QUICK_FORGE_PRESETS) {
      const res = validateCommunityPuzzleDraft(preset);
      expect(res.ok, res.errors.join('; ')).toBe(true);
      expect(res.readinessPct).toBe(100);
    }

    expect(normalizeSubredditName('mechanicalkeyboards')).toBe('r/mechanicalkeyboards');
    expect(normalizeSubredditName('/r/Science!! ')).toBe('r/Science');
    expect(normalizeSubredditName('   ')).toBe('r/KarmaForgeDaily');
    expect(getTomorrowUtcDateKey('2026-11-24')).toBe('2026-11-25');
  });

  it('rejects incomplete drafts and duplicate card titles across bridge links and trolls', () => {
    const base = QUICK_FORGE_PRESETS[0]!;

    const empty = validateCommunityPuzzleDraft({
      ...base,
      title: 'Hi',
      openingTitle: 'Short',
      finaleTitle: 'End',
      links: base.links.map((l) => ({ ...l, title: '' })),
      trolls: base.trolls.map((t) => ({ ...t, title: '' })),
    });
    expect(empty.ok).toBe(false);
    expect(empty.readinessPct).toBeLessThan(30);
    expect(empty.fieldErrors.title).toBeDefined();
    expect(empty.fieldErrors.openingTitle).toBeDefined();

    const duplicate = validateCommunityPuzzleDraft({
      ...base,
      trolls: [
        { ...base.trolls[0]!, title: base.links[0]!.title },
        base.trolls[1]!,
      ],
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.fieldErrors.troll_0).toContain('duplicates');
  });

  it('ranks tomorrow vote nominees by votes descending, breaking ties by newest timestamp', () => {
    const seeds = buildSeedCommunityNominees('2026-11-25');
    const sorted = sortCommunitySubmissions([
      { ...seeds[2]!, votes: 15, createdAt: '2026-11-24T12:00:00.000Z' },
      { ...seeds[0]!, votes: 50, createdAt: '2026-11-24T09:00:00.000Z' },
      { ...seeds[1]!, votes: 50, createdAt: '2026-11-24T11:00:00.000Z' },
    ]);
    expect(sorted[0]?.id).toBe(seeds[1]?.id);
    expect(sorted[1]?.id).toBe(seeds[0]?.id);
    expect(sorted[2]?.id).toBe(seeds[2]?.id);
  });

  it('persists new Community Forge puzzles and multi-user upvote toggles in KvStore', async () => {
    const store = new FileBackedKvStore(null);
    const alice: RequestActor = {
      userId: 't2_alice',
      username: 'u/AliceBuilder',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_demo',
    };
    const bob: RequestActor = {
      userId: 't2_bob',
      username: 'u/BobVoter',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_demo',
    };
    const now = new Date('2026-11-24T15:00:00.000Z');

    const initial = await listCommunityPuzzles(store, alice, now);
    expect(initial.tomorrowUtc).toBe('2026-11-25');
    expect(initial.items).toHaveLength(3);

    const created = await createCommunityPuzzle(store, alice, QUICK_FORGE_PRESETS[0]!, now);
    expect(created.ok).toBe(true);
    expect(created.submission.authorUsername).toBe('u/AliceBuilder');
    expect(created.submission.votes).toBe(1);
    expect(created.submission.hasVoted).toBe(true);
    expect(created.queue.items).toHaveLength(4);

    // Bob upvotes Alice's submission -> jumps to 2 votes
    const bobUp = await toggleCommunityVote(store, bob, { puzzleId: created.submission.id }, now);
    expect(bobUp.ok).toBe(true);
    expect(bobUp.votes).toBe(2);
    expect(bobUp.hasVoted).toBe(true);

    // Bob toggles vote off -> drops back to 1 vote (anti-spam)
    const bobOff = await toggleCommunityVote(store, bob, { puzzleId: created.submission.id }, now);
    expect(bobOff.votes).toBe(1);
    expect(bobOff.hasVoted).toBe(false);

    // Voting on a curated seed nominee persists cleanly too
    const seedId = initial.items[0]!.id;
    const seedUp = await toggleCommunityVote(store, bob, { puzzleId: seedId }, now);
    expect(seedUp.votes).toBe(initial.items[0]!.votes + 1);
    expect(seedUp.hasVoted).toBe(true);
  });

  it('serves /api/community/puzzles and /api/community/vote cleanly over Express HTTP', async () => {
    const store = new FileBackedKvStore(null);
    const actor: RequestActor = {
      userId: 't2_http',
      username: 'u/HttpTester',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_http',
    };
    const app = createKarmaForgeApp({ store, bridge: makeTestBridge(actor) });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      server.close();
      throw new Error('Failed to bind ephemeral port');
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const listRes = await fetch(`${baseUrl}/api/community/puzzles`);
      expect(listRes.status).toBe(200);
      const listJson = (await listRes.json()) as { items: Array<{ id: string; votes: number }> };
      expect(listJson.items.length).toBeGreaterThanOrEqual(3);

      // Invalid draft gets 400
      const badRes = await fetch(`${baseUrl}/api/community/puzzles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'bad' }),
      });
      expect(badRes.status).toBe(400);

      // Valid draft gets 201
      const okRes = await fetch(`${baseUrl}/api/community/puzzles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(QUICK_FORGE_PRESETS[1]),
      });
      expect(okRes.status).toBe(201);
      const createdJson = (await okRes.json()) as { submission: { id: string } };

      // Vote toggle works via HTTP
      const voteRes = await fetch(`${baseUrl}/api/community/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: createdJson.submission.id }),
      });
      expect(voteRes.status).toBe(200);
      const voteJson = (await voteRes.json()) as { votes: number; hasVoted: boolean };
      expect(voteJson.votes).toBe(0);
      expect(voteJson.hasVoted).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('KarmaForge · Full Server Service, Devvit Config & Dark Terminal Palette Hygiene', () => {
  it('completes a real persisted game loop: state -> hint -> partial -> win -> leaderboard -> share -> archive', async () => {
    const store = new FileBackedKvStore(null);
    const actor: RequestActor = {
      userId: 't2_tester',
      username: 'u/Mindless-Past7833',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_demo123',
    };
    const bridge = makeTestBridge(actor);

    const now = new Date('2026-11-24T12:00:00.000Z');
    const initial = await buildGameState(store, bridge, actor, '2026-11-24', now);
    expect(initial.solutionReveal).toBeNull();
    expect(initial.progress.status).toBe('playing');

    const afterHint = await handleHintUnlock(store, bridge, actor, { dateKey: '2026-11-24' }, now);
    expect(afterHint.revealedHints).toHaveLength(1);

    const { puzzle } = getPuzzleForDate('2026-11-24');
    const red = puzzle.cards.find((c) => c.isRedHerring)!;
    const afterPartial = await handleGuessSubmission(
      store,
      bridge,
      actor,
      {
        dateKey: '2026-11-24',
        cardIds: [puzzle.solutionIds[0], puzzle.solutionIds[2], red.id, puzzle.solutionIds[3]],
        elapsedSeconds: 18,
      },
      now,
    );
    expect(afterPartial.progress.status).toBe('playing');
    expect(afterPartial.progress.attempts).toHaveLength(1);

    const afterWin = await handleGuessSubmission(
      store,
      bridge,
      actor,
      {
        dateKey: '2026-11-24',
        cardIds: [...puzzle.solutionIds],
        elapsedSeconds: 36,
      },
      now,
    );
    expect(afterWin.progress.status).toBe('won');
    expect(afterWin.streak.currentStreak).toBe(1);
    expect(afterWin.streak.flair.title).toBe('Lurker');
    expect(afterWin.progress.comboMultiplier).toBeGreaterThan(1);
    expect(afterWin.leaderboard).toHaveLength(1);
    expect(afterWin.leaderboard[0]?.username).toBe('u/Mindless-Past7833');
    expect(afterWin.solutionReveal).not.toBeNull();

    const shared = await handleShareComment(store, bridge, actor, { dateKey: '2026-11-24' }, now);
    expect(shared.ok).toBe(true);
    expect(shared.recentShares).toHaveLength(1);

    const archive = await buildArchiveList(store, actor, now);
    expect(archive.editions).toHaveLength(60);
    expect(archive.editions[0]?.status).toBe('won');
  });

  it('validates devvit.json cleanly against the official @devvit/shared-types v0.15 schema', async () => {
    const rawJson = fs.readFileSync(path.join(projectRoot, 'devvit.json'), 'utf8');
    const validatorModulePath = path.resolve(
      projectRoot,
      'node_modules/@devvit/shared-types/schemas/config-file.v1.js',
    );
    const { parseAppConfig } = (await import(validatorModulePath)) as {
      parseAppConfig: (str: string, allowUninitialized: boolean) => {
        name: string;
        permissions: { redis: boolean; reddit: { enable: boolean } };
        post?: { dir: string; entrypoints: { default: { entry: string } } };
        server?: { dir: string; entry: string };
      };
    };

    const parsed = parseAppConfig(rawJson, false);
    expect(parsed.name).toBe('karmaforge-daily');
    expect(parsed.permissions.redis).toBe(true);
    expect(parsed.permissions.reddit.enable).toBe(true);
    expect(parsed.post?.dir).toBe('dist/client');
    expect(parsed.post?.entrypoints.default.entry).toBe('index.html');
    expect(parsed.server?.dir).toBe('dist/server');
    expect(parsed.server?.entry).toBe('index.cjs');
  });

  it('enforces Dark Terminal Geek palette tokens, banishes cream broadsheet hexes, and blocks all blue/cyan/teal/purple hues', () => {
    const css = fs.readFileSync(path.join(projectRoot, 'src/client/styles.css'), 'utf8');
    const svg = fs.readFileSync(path.join(projectRoot, 'src/client/components/BrandMark.tsx'), 'utf8');
    const html = fs.readFileSync(path.join(projectRoot, 'src/client/index.html'), 'utf8');
    const combined = `${css}\n${svg}\n${html}`;

    // Required V2 Dark Terminal Geek tokens present
    for (const requiredHex of ['#101010', '#191918', '#EFECE6', '#FF4500', '#36C96E', '#F5B731', '#2D2C2A']) {
      expect(combined.toUpperCase()).toContain(requiredHex);
    }

    // Legacy cream broadsheet palette completely purged
    for (const purgedHex of ['#FAF5EB', '#FFFDF9', '#F2EADB']) {
      expect(combined.toUpperCase()).not.toContain(purgedHex);
    }

    const hexMatches = combined.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    for (const hex of hexMatches) {
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.12) continue;

      let hue = 0;
      const d = max - min;
      if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) hue = ((b - r) / d + 2) * 60;
      else hue = ((r - g) / d + 4) * 60;

      const isForbiddenHue = hue >= 165 && hue <= 315;
      expect(isForbiddenHue, `Forbidden hue color detected: ${hex} (hue=${Math.round(hue)}°)`).toBe(
        false,
      );
    }
  });

  it('produces a 60-day Archive Streak Heatmap dataset with accurate multi-day statuses and move counts', async () => {
    const store = new FileBackedKvStore(null);
    const actor: RequestActor = {
      userId: 't2_heatmap',
      username: 'u/HeatmapVerifier',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_heatmap',
    };
    const bridge = makeTestBridge(actor);
    const now = new Date('2026-11-24T12:00:00.000Z');

    // Solve today in 1 move (Flash Solve)
    const todayPuzzle = getPuzzleForDate('2026-11-24').puzzle;
    await handleGuessSubmission(
      store,
      bridge,
      actor,
      { dateKey: '2026-11-24', cardIds: [...todayPuzzle.solutionIds], elapsedSeconds: 15 },
      now,
    );

    // Partial play on yesterday (Active)
    const yestPuzzle = getPuzzleForDate('2026-11-23').puzzle;
    const yestRed = yestPuzzle.cards.find((c) => c.isRedHerring)!;
    await handleGuessSubmission(
      store,
      bridge,
      actor,
      {
        dateKey: '2026-11-23',
        cardIds: [yestPuzzle.solutionIds[0], yestPuzzle.solutionIds[1], yestRed.id, yestPuzzle.solutionIds[3]],
        elapsedSeconds: 22,
      },
      now,
    );

    const archive = await buildArchiveList(store, actor, now);
    expect(archive.editions).toHaveLength(60);
    expect(archive.editions[0]?.dateKey).toBe('2026-11-24');
    expect(archive.editions[0]?.status).toBe('won');
    expect(archive.editions[0]?.movesUsed).toBe(1);
    expect(archive.editions[1]?.dateKey).toBe('2026-11-23');
    expect(archive.editions[1]?.status).toBe('playing');
    expect(archive.editions[1]?.movesUsed).toBe(1);
    expect(archive.editions[2]?.status).toBe('unplayed');
    expect(archive.editions[59]?.dateKey).toBe(addUtcDays('2026-11-24', -59));
  });

  it('safely executes Web Audio mechanical key-click, toggle chime, and forge-lock hooks in headless environments', () => {
    expect(() => playKeyClick(false)).not.toThrow();
    expect(() => playKeyClick(true)).not.toThrow();
    expect(() => playToggleChime(false)).not.toThrow();
    expect(() => playToggleChime(true)).not.toThrow();
    expect(() => playAttemptFeedback(true, ['exact', 'misplaced', 'wrong', 'exact'])).not.toThrow();
    expect(() => playVictoryChord(true)).not.toThrow();
  });
});

describe('KarmaForge V4 · Iron Forge Hard Mode, Crowd Consensus & Micro-Guidance', () => {
  const samplePuzzle = PUZZLES[31]!;
  const [s0, s1, s2, s3] = samplePuzzle.solutionIds;
  const redHerrings = samplePuzzle.cards.filter((c) => c.isRedHerring).map((c) => c.id);
  const [t0, t1] = redHerrings as [string, string];

  it('enforces Iron Forge 3-attempt cap and strict clue discipline across exact, misplaced, and red herring slots', () => {
    expect(getMaxAttempts(false)).toBe(5);
    expect(getMaxAttempts(true)).toBe(IRON_FORGE_MAX_ATTEMPTS);
    expect(IRON_FORGE_MAX_ATTEMPTS).toBe(3);

    const g1 = gradeAttempt(samplePuzzle, [s0, s2, t0, s3]);
    const attempts = [
      {
        attemptNumber: 1,
        slots: g1.slots,
        exactCount: g1.exactCount,
        misplacedCount: g1.misplacedCount,
        wrongCount: g1.wrongCount,
        submittedAt: '2026-11-25T10:00:00.000Z',
      },
    ];

    // Moving confirmed Exact slot 0 fails
    expect(validateIronForgeConstraints(attempts, [s1, s0, s2, s3])).toContain('Exact link');
    // Replaying known Red Herring t0 fails
    expect(validateIronForgeConstraints(attempts, [s0, t0, s2, s3])).toContain('Red Herrings');
    // Dropping previously revealed Misplaced link s2 fails
    expect(validateIronForgeConstraints(attempts, [s0, s1, t1, s3])).toContain('Misplaced');
    // Keeping Misplaced link s2 in rejected Slot #2 fails
    expect(validateIronForgeConstraints(attempts, [s0, s2, s1, s3])).toContain('rejected Slot #2');
    // Valid next guess honoring all revealed clues passes
    expect(validateIronForgeConstraints(attempts, [s0, s1, s2, s3])).toBeNull();
  });

  it('stamps ⚒️ IRON FORGE gold crest and Crowd Consensus percentile on spoiler-free Reddit comment markdown', () => {
    const pub = toPublicPuzzlePayload(samplePuzzle, '2026-11-25', 329);
    const g1 = gradeAttempt(samplePuzzle, [s0, s2, t0, s3]);
    const g2 = gradeAttempt(samplePuzzle, [s0, s1, s2, s3]);
    const streak = buildPlayerStreak({
      currentStreak: 5,
      bestStreak: 5,
      totalSolved: 5,
      lastSolvedDate: '2026-11-25',
    });
    const consensus = computeCrowdConsensus({
      difficulty: samplePuzzle.difficulty,
      liveDistribution: { moves1: 1, moves2: 2, moves3: 4, moves4: 3, moves5: 1, losses: 1 },
      ironForgeSolves: 1,
      playerStatus: 'won',
      playerMoves: 2,
      playerElapsedSeconds: 28,
      playerHardMode: true,
    });

    const md = generateSpoilerFreeShareMarkdown({
      puzzle: pub,
      status: 'won',
      attempts: [
        {
          attemptNumber: 1,
          slots: g1.slots,
          exactCount: g1.exactCount,
          misplacedCount: g1.misplacedCount,
          wrongCount: g1.wrongCount,
          submittedAt: '2026-11-25T10:00:00.000Z',
        },
        {
          attemptNumber: 2,
          slots: g2.slots,
          exactCount: g2.exactCount,
          misplacedCount: g2.misplacedCount,
          wrongCount: g2.wrongCount,
          submittedAt: '2026-11-25T10:00:28.000Z',
        },
      ],
      elapsedSeconds: 28,
      hintsUsed: 0,
      streak,
      hardMode: true,
      crowdConsensus: consensus,
    });

    expect(md).toContain('⚒️ IRON FORGE');
    expect(md).toContain('2/3 moves');
    expect(md).toContain(`Sharper than ${consensus.sharperThanPct}% of r/KarmaForge`);
    expect(md).toContain('Iron Speed Runner');
    for (const card of samplePuzzle.cards) {
      expect(md).not.toContain(card.title);
    }
  });

  it('awards 1.25x Iron Forge Karma bonus and persists hardMode through server loop, leaderboard, and archive', async () => {
    const std = computeSpeedCombo({
      moves: 2,
      elapsedSeconds: 20,
      hintsUsed: 0,
      currentStreak: 2,
      hardMode: false,
    });
    const iron = computeSpeedCombo({
      moves: 2,
      elapsedSeconds: 20,
      hintsUsed: 0,
      currentStreak: 2,
      hardMode: true,
    });
    expect(iron.multiplier).toBeGreaterThan(std.multiplier);
    expect(iron.finalKarma).toBeGreaterThan(std.finalKarma);
    expect(iron.tierLabel).toBe('Iron Flash Forge');

    const store = new FileBackedKvStore(null);
    const actor: RequestActor = {
      userId: 't2_iron_smith',
      username: 'u/IronThreadSmith',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_iron',
    };
    const bridge = makeTestBridge(actor);
    const now = new Date('2026-11-25T12:00:00.000Z');
    const { puzzle } = getPuzzleForDate('2026-11-25');
    const red = puzzle.cards.find((c) => c.isRedHerring)!;

    const p1 = await handleGuessSubmission(
      store,
      bridge,
      actor,
      {
        dateKey: '2026-11-25',
        cardIds: [puzzle.solutionIds[0], puzzle.solutionIds[2], red.id, puzzle.solutionIds[3]],
        elapsedSeconds: 16,
        hardMode: true,
      },
      now,
    );
    expect(p1.progress.hardMode).toBe(true);
    expect(p1.crowdConsensus).toBeNull();

    // Server rejects Iron Forge clue violation (replaying red herring)
    await expect(
      handleGuessSubmission(
        store,
        bridge,
        actor,
        {
          dateKey: '2026-11-25',
          cardIds: [puzzle.solutionIds[0], red.id, puzzle.solutionIds[2], puzzle.solutionIds[3]],
          elapsedSeconds: 20,
          hardMode: false, // Even attempting to downgrade mid-game is ignored once locked!
        },
        now,
      ),
    ).rejects.toThrow(/Iron Forge rule/);

    // Valid Attempt 2 solve finishes Iron Forge run and logs live Crowd Consensus telemetry
    const won = await handleGuessSubmission(
      store,
      bridge,
      actor,
      {
        dateKey: '2026-11-25',
        cardIds: [...puzzle.solutionIds],
        elapsedSeconds: 24,
        hardMode: true,
      },
      now,
    );
    expect(won.progress.status).toBe('won');
    expect(won.progress.hardMode).toBe(true);
    expect(won.stats.ironForgeSolves).toBe(1);
    expect(won.stats.moveDistribution?.moves2).toBe(1);
    expect(won.crowdConsensus).not.toBeNull();
    expect(won.crowdConsensus?.liveSampleSize).toBe(1);
    expect(won.crowdConsensus?.sharperThanPct).toBeGreaterThanOrEqual(50);
    expect(won.shareMarkdown).toContain('⚒️ IRON FORGE');
    expect(won.leaderboard[0]?.hardMode).toBe(true);

    const archive = await buildArchiveList(store, actor, now);
    expect(archive.editions[0]?.hardMode).toBe(true);
    expect(archive.editions[0]?.movesUsed).toBe(2);
  });

  it('locks Iron Forge runs as lost after 3 missed attempts and records live losses in move distribution', async () => {
    const store = new FileBackedKvStore(null);
    const actor: RequestActor = {
      userId: 't2_iron_loss',
      username: 'u/IronChallenger',
      subredditName: 'r/KarmaForgeDaily',
      postId: 't3_ironloss',
    };
    const bridge = makeTestBridge(actor);
    const now = new Date('2026-11-25T14:00:00.000Z');
    const { puzzle } = getPuzzleForDate('2026-11-25');
    const [a0, a1, a2, a3] = puzzle.solutionIds;

    // 3 non-solving permutations (all valid Iron Forge guesses, never repeating rejected slots)
    await handleGuessSubmission(
      store,
      bridge,
      actor,
      { dateKey: '2026-11-25', cardIds: [a1, a2, a3, a0], elapsedSeconds: 10, hardMode: true },
      now,
    );
    await handleGuessSubmission(
      store,
      bridge,
      actor,
      { dateKey: '2026-11-25', cardIds: [a2, a3, a0, a1], elapsedSeconds: 20, hardMode: true },
      now,
    );
    const lost = await handleGuessSubmission(
      store,
      bridge,
      actor,
      { dateKey: '2026-11-25', cardIds: [a3, a0, a1, a2], elapsedSeconds: 30, hardMode: true },
      now,
    );

    expect(lost.progress.status).toBe('lost');
    expect(lost.progress.attempts).toHaveLength(3);
    expect(lost.stats.moveDistribution?.losses).toBe(1);
    expect(lost.crowdConsensus?.sharperThanPct).toBe(0);
    expect(lost.crowdConsensus?.buckets.find((b) => b.key === 'X')?.isPlayerBucket).toBe(true);
    expect(lost.shareMarkdown).toContain('X/3 moves');
    expect(lost.shareMarkdown).not.toContain('⚒️ IRON FORGE');
  });

  it('computes deterministic Global Crowd Consensus blending priors + live Redis counts monotonically', () => {
    const baseInput = {
      difficulty: 'Spicy' as const,
      liveDistribution: { moves1: 2, moves2: 5, moves3: 8, moves4: 4, moves5: 1, losses: 1 },
      ironForgeSolves: 2,
      playerStatus: 'won' as const,
      playerMoves: 2,
      playerElapsedSeconds: 32,
      playerHardMode: false,
    };

    const runA = computeCrowdConsensus(baseInput);
    const runB = computeCrowdConsensus(baseInput);
    expect(runA).toEqual(runB);
    expect(runA.buckets).toHaveLength(6);
    expect(runA.liveSampleSize).toBe(21);
    expect(runA.priorSampleSize).toBe(40);
    expect(runA.buckets.find((b) => b.key === '2')?.isPlayerBucket).toBe(true);
    expect(runA.headline).toBe(`Sharper than ${runA.sharperThanPct}% of r/KarmaForge`);

    // Adding 40 slower 4-move live solvers strictly raises a 2-move winner's percentile
    const shifted = computeCrowdConsensus({
      ...baseInput,
      liveDistribution: { ...baseInput.liveDistribution, moves4: 44 },
    });
    expect(shifted.sharperThanPct).toBeGreaterThan(runA.sharperThanPct);
  });

  it('clamps Crowd Consensus percentile cleanly to [1, 99] on wins and 0 on losses under extreme live skew', () => {
    const ultraFastWin = computeCrowdConsensus({
      difficulty: 'Galaxy Brain',
      liveDistribution: { moves1: 1, moves2: 0, moves3: 0, moves4: 0, moves5: 0, losses: 500 },
      playerStatus: 'won',
      playerMoves: 1,
      playerElapsedSeconds: 5,
      playerHardMode: true,
    });
    expect(ultraFastWin.sharperThanPct).toBeGreaterThanOrEqual(95);
    expect(ultraFastWin.sharperThanPct).toBeLessThanOrEqual(99);

    const slowLastMoveWin = computeCrowdConsensus({
      difficulty: 'Mild',
      liveDistribution: { moves1: 1000, moves2: 0, moves3: 0, moves4: 0, moves5: 1, losses: 0 },
      playerStatus: 'won',
      playerMoves: 5,
      playerElapsedSeconds: 180,
      playerHardMode: false,
    });
    expect(slowLastMoveWin.sharperThanPct).toBeGreaterThanOrEqual(1);
    expect(slowLastMoveWin.sharperThanPct).toBeLessThanOrEqual(10);

    const lossSummary = computeCrowdConsensus({
      difficulty: 'Mild',
      liveDistribution: { moves1: 10, moves2: 20, moves3: 10, moves4: 0, moves5: 0, losses: 5 },
      playerStatus: 'lost',
      playerMoves: 5,
      playerElapsedSeconds: 90,
      playerHardMode: false,
    });
    expect(lossSummary.sharperThanPct).toBe(0);
    expect(lossSummary.headline).toContain('r/KarmaForge');

    // NaN / negative / Infinity telemetry values never poison percentile or bucket percentages
    const corrupted = computeCrowdConsensus({
      difficulty: 'Mild',
      liveDistribution: {
        moves1: Number.NaN,
        moves2: -10,
        moves3: Number.POSITIVE_INFINITY,
        moves4: 0,
        moves5: 0,
        losses: Number.NaN,
      },
      ironForgeSolves: Number.NaN,
      playerStatus: 'won',
      playerMoves: Number.NaN,
      playerElapsedSeconds: Number.NaN,
      playerHardMode: true,
    });
    expect(Number.isFinite(corrupted.sharperThanPct)).toBe(true);
    expect(corrupted.sharperThanPct).toBeGreaterThanOrEqual(1);
    expect(corrupted.sharperThanPct).toBeLessThanOrEqual(99);
    expect(corrupted.liveSampleSize).toBe(0);
    expect(corrupted.ironForgeSolves).toBe(0);
    expect(corrupted.buckets.every((b) => Number.isFinite(b.pct))).toBe(true);
  });

  it('controls 3-second micro-guidance visibility and one-shot dismissal across first action and persistence', () => {
    expect(MICRO_GUIDE_STORAGE_KEY).toBe('karmaforge:micro_guide_dismissed:v1');

    // Fresh player on Daily tab with 0 attempts and 0 placed cards sees micro-guide
    expect(
      shouldShowMicroGuide({
        dismissed: false,
        isPlaying: true,
        activeTab: 'daily',
        attemptsCount: 0,
        placedCount: 0,
      }),
    ).toBe(true);

    // Placing 1st card immediately hides micro-guide
    expect(
      shouldShowMicroGuide({
        dismissed: false,
        isPlaying: true,
        activeTab: 'daily',
        attemptsCount: 0,
        placedCount: 1,
      }),
    ).toBe(false);

    // Persisted dismissed flag keeps micro-guide hidden even after clearing slots or reloading
    expect(
      shouldShowMicroGuide({
        dismissed: true,
        isPlaying: true,
        activeTab: 'daily',
        attemptsCount: 0,
        placedCount: 0,
      }),
    ).toBe(false);

    // Switching to Community Forge or viewing finished game hides micro-guide
    expect(
      shouldShowMicroGuide({
        dismissed: false,
        isPlaying: true,
        activeTab: 'community',
        attemptsCount: 0,
        placedCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowMicroGuide({
        dismissed: false,
        isPlaying: false,
        activeTab: 'daily',
        attemptsCount: 0,
        placedCount: 0,
      }),
    ).toBe(false);
  });
});
