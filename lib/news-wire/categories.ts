/**
 * The twelve RMH News categories and their guard, apart from the keyword tables in `./categorize.ts`: the `/news`
 * routes check a `?category=` search value with {@link isNewsCategory} at top level, so whatever this file holds is
 * in the client entry on every page. `categorize.ts` re-exports both names.
 *
 * Client-safe and dependency-free (it is in the strict island, tsconfig.strict.json).
 */

export const NEWS_CATEGORIES = [
  'World',
  'Politics',
  'Business',
  'Technology',
  'AI',
  'Science',
  'Space',
  'Health',
  'Climate',
  'Gaming',
  'Entertainment',
  'Sports',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export function isNewsCategory(value: unknown): value is NewsCategory {
  return typeof value === 'string' && (NEWS_CATEGORIES as readonly string[]).includes(value);
}
