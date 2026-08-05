/**
 * Single source of truth for all apps displayed on the site.
 *
 * The data itself now lives one file per app under `lib/catalog/apps/`,
 * aggregated and zod-validated by `lib/catalog/index.ts` — see that file for
 * why. This module stays as a re-export so every existing importer of
 * `@/lib/apps` is untouched; it is the stable public name for the catalog.
 */

export { apps } from './catalog';
export type { AppInfo } from './catalog/types';
