/**
 * The `?p=` search parameter of a passage link (`./passage-link.ts`), on its own so a route's `validateSearch` can
 * read it without the encoder: a route module is on every page's critical path, and a module shared with a lazy
 * chunk lands there whole (`scripts/check-bundle-budget.ts`).
 */

/** The longest code a route accepts in `?p=` (validateSearch). */
export const PASSAGE_CODE_MAX = 900;

/** `validateSearch` helper: the code when it is a string within the limit, else undefined. */
export function parsePassageSearch(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= PASSAGE_CODE_MAX ? value : undefined;
}
