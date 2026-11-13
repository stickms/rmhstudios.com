/**
 * The RMH businesses a sitewide announcement can be published under.
 *
 * Add a business by adding one entry here — the admin blog editor, the
 * announcement popup, and the feed card all read from this list. `id` is
 * persisted in `BlogPost.business`, so never rename an existing id.
 */

export interface Business {
  /** Stable id stored in the database (kebab-case, ≤ 40 chars). */
  id: string;
  /** Display name. Brand names are not translated. */
  name: string;
  /** 1–3 letter monogram for the business mark. */
  mark: string;
  /** Where the business lives on the site, when it has a page. */
  href?: string;
}

export const BUSINESSES = [
  { id: 'rmh-studios', name: 'RMH Studios', mark: 'RMH', href: '/' },
  { id: 'rmh-capital', name: 'RMH Capital', mark: 'RC', href: '/rmh-capital' },
  { id: 'adaptive-intelligence', name: 'Adaptive Intelligence', mark: 'AI', href: '/adaptive-intelligence' },
  { id: 'rmh-research', name: 'RMH Research', mark: 'RR' },
  { id: 'rmh-designs', name: 'RMH Designs', mark: 'RD', href: '/rmh-designs/' },
  { id: 'rmh-pmc', name: 'RMH PMC', mark: 'PMC', href: '/rmh-pmc' },
] as const satisfies readonly Business[];

export type BusinessId = (typeof BUSINESSES)[number]['id'];

export const DEFAULT_BUSINESS_ID: BusinessId = 'rmh-studios';

export const BUSINESS_IDS = BUSINESSES.map((b) => b.id) as [BusinessId, ...BusinessId[]];

export function isBusinessId(value: unknown): value is BusinessId {
  return typeof value === 'string' && BUSINESSES.some((b) => b.id === value);
}

/** Look up a business; unknown/legacy ids fall back to RMH Studios. */
export function getBusiness(id: string | null | undefined): Business {
  return BUSINESSES.find((b) => b.id === id) ?? BUSINESSES[0];
}
