import { z } from 'zod';
import { DISPUTE_NOTE_MAX } from './match-results';

const entrantId = z.string().min(1).max(64);
const note = z
  .string()
  .trim()
  .max(DISPUTE_NOTE_MAX)
  // A blank note is no note. The transform sits inside `.optional()` so the parsed key stays optional.
  .transform((v) => (v ? v : undefined))
  .optional();

/** Dispute a claim; the note is optional, at most 300 characters. */
export const disputeResultSchema = z.object({
  note,
});
export type DisputeResultInput = z.input<typeof disputeResultSchema>;

/** The host's or an admin's decision on a claim or dispute. */
export const decideResultSchema = z.object({
  winnerEntrantId: entrantId,
  note,
});
export type DecideResultInput = z.input<typeof decideResultSchema>;
