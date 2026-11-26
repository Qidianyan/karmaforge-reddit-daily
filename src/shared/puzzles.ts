import type { PuzzleDefinition } from './types.js';
import { PUZZLES_PART_1 } from './puzzles-part1.js';
import { PUZZLES_PART_2 } from './puzzles-part2.js';
import { PUZZLES_PART_3 } from './puzzles-part3.js';
import { PUZZLES_PART_4 } from './puzzles-part4.js';

export const PUZZLES: readonly PuzzleDefinition[] = [
  ...PUZZLES_PART_1,
  ...PUZZLES_PART_2,
  ...PUZZLES_PART_3,
  ...PUZZLES_PART_4,
];

export const PUZZLE_BY_ID: ReadonlyMap<string, PuzzleDefinition> = new Map(
  PUZZLES.map((p) => [p.id, p]),
);
