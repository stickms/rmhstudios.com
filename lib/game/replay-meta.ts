/**
 * The replay constants route definitions read — titles for `head()`, the
 * version tags the speedrun catalog pins — in a module with no zod in it.
 *
 * `lib/game/replay.ts` builds its replay schemas with zod at module scope, and
 * anything a route definition imports (for `head`, `loader`, `validateSearch`)
 * is in the shared entry chunk, so importing a title from there put all of zod
 * (~70 KB minified) on the critical path of every page on the site. `replay.ts`
 * re-exports these, so existing imports keep working; route files and anything
 * they reach should import from here.
 */

export const LIGHTS_OUT_VERSION = 'lo-1';

export const SLICE_IT_VERSION = 'si-1';

/** Display titles for the capturable games (kept in sync with lib/games.ts). */
export const REPLAY_GAME_TITLES: Record<string, string> = {
  'lights-out': 'Lights Out',
  'slice-it': 'Slice It!',
  'daily-puzzle': 'Daily Puzzles',
};
