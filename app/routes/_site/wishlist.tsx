/**
 * /wishlist — legacy redirect to the Wishlist tab of /saves.
 *
 * Still its own store (a wishlist entry carries a target price, which a save
 * does not) — but not its own destination. "Things I kept" is one place.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/wishlist')({
  beforeLoad: () => {
    throw redirect({ to: '/saves', search: { tab: 'wishlist' } });
  },
});
