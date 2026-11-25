import type {
  AttemptRecord,
  GradedSlot,
  PuzzleDefinition,
  SlotVerdict,
  SpeedComboBreakdown,
} from './types.js';
import { CARD_POOL_SIZE, MAX_ATTEMPTS, SLOT_COUNT } from './types.js';

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
  const combinedMult = Number((speedMult * (1 + streakBonusPct / 100)).toFixed(2));
  const finalKarma = Math.round(baseScore * combinedMult);

  return {
    multiplier: combinedMult,
    tierLabel,
    baseScore,
    streakBonusPct,
    finalKarma,
  };
}

/**
 * Composite ascending rank score for Redis sorted set leaderboards:
 * primary sort = fewer moves, secondary = faster time, tertiary = fewer hints.
 */
export function computeLeaderboardSortKey(params: {
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
}): number {
  const moves = Math.max(1, Math.min(MAX_ATTEMPTS, params.moves));
  const secs = Math.max(1, Math.min(86399, Math.round(params.elapsedSeconds)));
  const hints = Math.max(0, Math.min(9, params.hintsUsed));
  return moves * 1_000_000 + secs * 10 + hints;
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
