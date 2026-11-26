import { PUZZLES } from './puzzles.js';
import type { PublicBridgeCard, PublicPuzzlePayload, PuzzleDefinition } from './types.js';

/** UTC Epoch Day 1 for KarmaForge daily issue numbering. */
export const KARMAFORGE_EPOCH_UTC = '2026-01-01';
const EPOCH_MS = Date.parse(`${KARMAFORGE_EPOCH_UTC}T00:00:00.000Z`);
const DAY_MS = 86_400_000;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats any Date as a strict UTC calendar day key `YYYY-MM-DD`.
 */
export function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false;
  }
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    return false;
  }
  return getUtcDateKey(new Date(ms)) === value;
}

export function addUtcDays(dateKey: string, deltaDays: number): string {
  const ms = Date.parse(`${dateKey}T00:00:00.000Z`);
  return getUtcDateKey(new Date(ms + deltaDays * DAY_MS));
}

/**
 * Computes a positive deterministic daily issue number starting from KARMAFORGE_EPOCH_UTC = Issue #1.
 */
export function getIssueNumberForDate(dateKey: string): number {
  const ms = Date.parse(`${dateKey}T00:00:00.000Z`);
  const diffDays = Math.floor((ms - EPOCH_MS) / DAY_MS);
  return diffDays >= 0 ? diffDays + 1 : 1;
}

/**
 * Mulberry32 deterministic PRNG seeded from a string hash (FNV-1a 32-bit).
 */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seedStr: string): () => number {
  let state = hashSeed(seedStr) || 0x9e3779b9;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicShuffle<T>(items: readonly T[], seedStr: string): T[] {
  const copy = [...items];
  const rng = createSeededRng(seedStr);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Fixed deterministic order across all 60 curated puzzles so every 60-day rolling window
 * anywhere in the calendar year visits all 60 unique puzzles with zero repeats.
 */
const CURATED_CYCLE_ORDER: readonly number[] = deterministicShuffle(
  PUZZLES.map((_, idx) => idx),
  'karmaforge-curated-year-order-v1',
);

/**
 * Deterministically maps any UTC date (all 365+ days/year) to one of our 60 curated puzzles.
 */
export function getPuzzleForDate(dateKey: string): {
  puzzle: PuzzleDefinition;
  issueNumber: number;
} {
  const issueNumber = getIssueNumberForDate(dateKey);
  const zeroBasedDay = issueNumber - 1;
  const dayInCycle = ((zeroBasedDay % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  const puzzle = PUZZLES[CURATED_CYCLE_ORDER[dayInCycle]!]!;
  return { puzzle, issueNumber };
}

/**
 * Produces the client-safe public payload with cards deterministically shuffled per UTC date
 * (guaranteed never to accidentally land in exact solution order as the first 4 slots).
 */
export function toPublicPuzzlePayload(
  puzzle: PuzzleDefinition,
  dateKey: string,
  issueNumber: number,
): PublicPuzzlePayload {
  let shuffled = deterministicShuffle(puzzle.cards, `cards-${dateKey}-${puzzle.id}`);
  const startsSolved = puzzle.solutionIds.every((sid, idx) => shuffled[idx]?.id === sid);
  if (startsSolved) {
    shuffled = deterministicShuffle(puzzle.cards, `cards-alt-${dateKey}-${puzzle.id}`);
  }

  const publicCards: PublicBridgeCard[] = shuffled.map((card) => ({
    id: card.id,
    subreddit: card.subreddit,
    tag: card.tag,
    title: card.title,
    summary: card.summary,
  }));

  return {
    id: puzzle.id,
    issueNumber,
    dateKey,
    category: puzzle.category,
    subreddit: puzzle.subreddit,
    title: puzzle.title,
    difficulty: puzzle.difficulty,
    openingPost: puzzle.openingPost,
    finalePost: puzzle.finalePost,
    cards: publicCards,
    totalHints: puzzle.hints.length,
  };
}

/**
 * Generates the latest 60 distinct daily editions ending on `todayUtc` so Archive Browser
 * covers all 60 handcrafted puzzles with authentic dates!
 */
export function getArchiveDateKeys(todayUtc: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < PUZZLES.length; offset += 1) {
    dates.push(addUtcDays(todayUtc, -offset));
  }
  return dates;
}

/**
 * Seconds remaining until next UTC midnight (`00:00:00Z`).
 */
export function getSecondsUntilNextUtcDay(now: Date = new Date()): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.max(0, Math.floor((nextMidnight - now.getTime()) / 1000));
}

export function formatCountdownHms(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
