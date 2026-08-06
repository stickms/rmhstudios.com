/**
 * Site-authored links pinned to a specific profile.
 *
 * `profile.links` is user-editable and belongs to the account holder. This is
 * the other kind: a link the site puts on a profile, keyed by handle. There is
 * exactly one today, and it exists so the special case sits in a named module
 * instead of a `handle === '…'` buried in a 600-line hero component.
 *
 * Handles are stored lowercase (see the pattern in `lib/handle.ts`), so lookups
 * lowercase the profile's handle before indexing.
 */

import type { LinkProps } from '@tanstack/react-router';

export interface FeaturedProfileLink {
  /**
   * A site-relative route. Typed as `Link`'s own `to` rather than `string` so a
   * renamed or deleted route fails the typecheck here instead of shipping a
   * dead pill — these are internal links, never external URLs.
   */
  to: LinkProps['to'];
  label: string;
}

const FEATURED_PROFILE_LINKS: Record<string, FeaturedProfileLink> = {
  superflameaura: { to: '/sohumbum', label: 'Pledge status' },
};

export function getFeaturedProfileLink(
  handle: string | null | undefined,
): FeaturedProfileLink | null {
  if (!handle) return null;
  return FEATURED_PROFILE_LINKS[handle.toLowerCase()] ?? null;
}
