/**
 * Daily Puzzle replays — the client-safe half (P4).
 *
 * The schema and the version live here, apart from the verifier in
 * `replay.server.ts`, for the usual reason: `lib/game/replay.ts` is imported by
 * the replay player and therefore by the client bundle, and the verifier needs
 * Prisma because the puzzle's solution lives in a row rather than in a seed.
 */

import { z } from 'zod';

/** The five modes that store a puzzle row. Lights Out has its own contract. */
export const DAILY_REPLAY_MODES = ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'] as const;
export type DailyReplayMode = (typeof DAILY_REPLAY_MODES)[number];

export const DAILY_PUZZLE_VERSION = 'dp-1';

/** A word/name as it appears in a puzzle. Bounded for the obvious reason. */
const token = z.string().min(1).max(120);

export const dailyPuzzleReplaySchema = z.object({
  mode: z.enum(DAILY_REPLAY_MODES),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Seconds the run took. Only `alibi` scores on it; the rest ignore it. */
  timeSeconds: z.number().int().min(0).max(86_400).default(0),
  /**
   * The log. Shape depends on the mode and is narrowed in the verifier rather
   * than by a discriminated union: a wrong-shaped log for the mode is a failed
   * verification, which is the same outcome as a wrong answer and wants the
   * same handling.
   */
  inputs: z.array(z.union([token, z.array(token).max(12)])).max(40),
});

export type DailyPuzzleReplay = z.infer<typeof dailyPuzzleReplaySchema>;
