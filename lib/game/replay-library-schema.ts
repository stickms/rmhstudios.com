/** Request schemas for the replay library endpoints (/api/replays/mine, /board and /$id). */
import { z } from 'zod';
import { REPLAYABLE_GAME_IDS } from '@/lib/game/replay';

/** A replay game id: only games that record replays are accepted. */
const replayGame = z.string().refine((g) => REPLAYABLE_GAME_IDS.includes(g), 'Unknown game');

/** The page size of the member's own list. */
export const MY_REPLAYS_PAGE = 20;

/** Rows on a game's board. */
export const BOARD_SIZE = 10;

/** Rows on a Lights Out "fewest moves today" board (a board narrowed to one puzzle). */
export const TODAY_BOARD_SIZE = 3;

/** The Lights Out seed range (`lightsOutSchema.seed`): a date seed such as 20261122. */
export const LIGHTS_OUT_SEED_MAX = 99_999_999;

/** A replay id (a cuid). Used for the opaque list cursor too: it is the id of the last row of the page. */
export const replayIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** GET /api/replays/mine?game=&cursor= */
export const myReplaysQuery = z.object({
  game: replayGame.optional(),
  cursor: replayIdSchema.optional(),
});

/**
 * GET /api/replays/board?game=&seed= — `seed` narrows the board to the replays of one puzzle; only Lights Out
 * has puzzles with a seed, so any other game with a seed is refused.
 */
export const replayBoardQuery = z
  .object({
    game: replayGame,
    seed: z.coerce.number().int().min(0).max(LIGHTS_OUT_SEED_MAX).optional(),
  })
  .refine((q) => q.seed === undefined || q.game === 'lights-out', {
    message: 'seed is only accepted for lights-out',
    path: ['seed'],
  });

/** PATCH /api/replays/$id */
export const setReplayVisibilityBody = z.object({
  visibility: z.enum(['public', 'unlisted']),
});
