/**
 * Single source of truth for all games displayed on the site.
 * Both the homepage ProjectsSection and /games page read from this list.
 *
 * The data itself now lives one file per game under `lib/catalog/games/`,
 * aggregated and zod-validated by `lib/catalog/index.ts` — see that file for
 * why. This module stays as a re-export so the ~20 existing importers of
 * `@/lib/games` (routes, components, the site-reference generators) are
 * untouched; it is the stable public name for the catalog.
 */

export { games } from './catalog';
export type { GameInfo } from './catalog/types';
