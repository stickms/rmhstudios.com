/**
 * The RMH businesses a sitewide announcement can be published under.
 *
 * Add a business by adding one entry here — the admin blog editor, the
 * announcement popup, and the feed card all read from this list. `id` is
 * persisted in `BlogPost.business`, so never rename an existing id.
 *
 * A business that is also a vertical (a branded arm with its own pages) takes
 * its name and href from `VERTICALS` in `./verticals`, the registry the hubs
 * and the sitemap read, so the two lists cannot spell one brand two ways. The
 * ids stay written out here: they are stored strings, and the vertical lookup
 * fails loudly at import if one ever stops matching.
 */

import { VERTICALS } from './verticals';

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

/** A business whose name and page come from its vertical. */
function fromVertical<
  const Id extends string,
>(
  id: Id,
  mark: string,
): {
  id: Id;
  name: string;
  mark: string;
  href: string;
} {
  const vertical =
    VERTICALS.find(
      (
        v,
      ) =>
        v.id ===
        id,
    );
  if (
    !vertical
  )
    throw new Error(
      `lib/businesses: no vertical "${id}"`,
    );
  return {
    id,
    name: vertical.name,
    mark,
    href: vertical.base,
  };
}

export const BUSINESSES =
  [
    {
      id: 'rmh-studios',
      name: 'RMH Studios',
      mark: 'RMH',
      href: '/',
    },
    fromVertical(
      'rmh-capital',
      'RC',
    ),
    fromVertical(
      'adaptive-intelligence',
      'AI',
    ),
    fromVertical(
      'rmh-research',
      'RR',
    ),
    {
      id: 'rmh-designs',
      name: 'RMH Designs',
      mark: 'RD',
      href: '/rmh-designs/',
    },
    fromVertical(
      'rmh-pmc',
      'PMC',
    ),
  ] as const satisfies readonly Business[];

export type BusinessId =
  (typeof BUSINESSES)[number]['id'];

export const DEFAULT_BUSINESS_ID: BusinessId =
  'rmh-studios';

export const BUSINESS_IDS =
  BUSINESSES.map(
    (
      b,
    ) =>
      b.id,
  ) as [
    BusinessId,
    ...BusinessId[],
  ];

export function isBusinessId(
  value: unknown,
): value is BusinessId {
  return (
    typeof value ===
      'string' &&
    BUSINESSES.some(
      (
        b,
      ) =>
        b.id ===
        value,
    )
  );
}

/** Look up a business; unknown/legacy ids fall back to RMH Studios. */
export function getBusiness(
  id:
    | string
    | null
    | undefined,
): Business {
  return (
    BUSINESSES.find(
      (
        b,
      ) =>
        b.id ===
        id,
    ) ??
    BUSINESSES[0]
  );
}
