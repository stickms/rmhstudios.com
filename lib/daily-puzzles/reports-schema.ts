/**
 * zod schemas for the puzzle-report endpoints. Server-side only: the contract takes its types from here by
 * `import type`, so no zod ships to the client.
 */
import { z } from 'zod';
import { AI_PUZZLE_MODES } from '@/lib/daily-puzzles/generate-core';
import { REPORT_KINDS, REPORT_NOTE_MAX, REVIEW_OUTCOMES, REVIEW_NOTE_MAX } from '@/lib/daily-puzzles/reports';

export const puzzleModeSchema = z.enum(
  AI_PUZZLE_MODES as [(typeof AI_PUZZLE_MODES)[number], ...(typeof AI_PUZZLE_MODES)[number][]],
);
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const fileReportBody = z.object({
  gameMode: puzzleModeSchema,
  dateKey: dateKeySchema,
  kind: z.enum(REPORT_KINDS),
  note: z.string().max(REPORT_NOTE_MAX).optional(),
});

export const adminPuzzlesQuery = z.object({ mode: puzzleModeSchema });

export const replacePuzzleBody = z.object({
  gameMode: puzzleModeSchema,
  dateKey: dateKeySchema,
  /** The row the admin saw: its id and its createdAt (ISO). */
  seenId: z.string().min(1).max(64),
  seenCreatedAt: z.string().min(1).max(40),
});

export const generatePuzzleBody = z.object({
  gameMode: puzzleModeSchema,
  dateKey: dateKeySchema,
});

export const reviewReportsBody = z.object({
  gameMode: puzzleModeSchema,
  dateKey: dateKeySchema,
  outcome: z.enum(REVIEW_OUTCOMES),
  note: z.string().max(REVIEW_NOTE_MAX).optional(),
});
