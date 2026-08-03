/**
 * /bookmarks — legacy redirect to /saves.
 *
 * A bookmark is a save. `SavedItem` has listed 'rmhark' among its entity types
 * since it was built; `RMHarkBookmark` predated it and was never folded in, so
 * the same post could sit in two lists on two pages that did not know about
 * each other. Migration 20260803210000 merged the rows.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/bookmarks')({
  beforeLoad: () => {
    throw redirect({ to: '/saves', search: { tab: 'saved' } });
  },
});
