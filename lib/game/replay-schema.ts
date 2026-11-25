/** Request schemas for the replay routes (/api/replays, /api/replays/ghost). Client-safe. */
import { z } from 'zod';

/** POST /api/replays. The payload is re-validated per game inside `saveReplay`. */
export const submitReplayBody = z.object({
  game: z.string().min(1).max(32),
  // Payload is re-validated per-game inside saveReplay against the game's own
  // schema; here we only need it to be a JSON object.
  data: z.record(z.string(), z.unknown()),
  score: z.number().finite().optional(),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
  visibility: z.enum(['public', 'unlisted']).optional(),
});

/** GET /api/replays/ghost?game=neon-driftway&level=1&vs=pb|top|friend[&friend=<userId>] */
export const getGhostQuery = z
  .object({
    game: z.literal('neon-driftway'),
    level: z.coerce.number().int().min(1).max(3),
    vs: z.enum(['pb', 'top', 'friend']).default('pb'),
    friend: z.string().min(1).max(64).optional(),
  })
  .refine((q) => q.vs !== 'friend' || q.friend !== undefined, {
    message: 'friend is required when vs is friend',
    path: ['friend'],
  });

/** GET /api/replays/ghost/friends?game=neon-driftway&level=1 */
export const friendGhostsQuery = z.object({
  game: z.literal('neon-driftway'),
  level: z.coerce.number().int().min(1).max(3),
});

/** POST /api/replays/ghost */
export const saveGhostBody = z.object({
  game: z.literal('neon-driftway'),
  level: z.number().int().min(1).max(3),
  data: z.record(z.string(), z.unknown()),
  score: z.number().int().min(0).max(100_000_000),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
});
