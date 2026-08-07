/**
 * O8 — `/admin/slice-it-content`.
 *
 * The page body is `components/slice-it/admin/ContentDashboard.tsx` and is
 * loaded lazily: `routeTree.gen.ts` imports every route module statically, so
 * anything this file touches at top level ships in the entry chunk that every
 * page on the site downloads (`scripts/check-bundle-budget.ts`, OPT-01). An
 * admin dashboard read by a handful of people does not belong in that budget.
 */

import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

export const Route = createFileRoute('/_site/admin/slice-it-content')({
  // Title only, and no canonical: `lib/sitemap.ts` classifies this `admin`, so
  // it is deliberately unindexed. A page still needs a title — without one the
  // browser tab shows the raw URL, which is the admin area's whole navigation.
  head: () => ({ meta: [{ title: 'Slice It content & storage | RMH Studios' }] }),
  component: ContentDashboardRoute,
});

const ContentDashboard = lazy(() =>
  import('@/components/slice-it/admin/ContentDashboard').then((m) => ({
    default: m.ContentDashboard,
  })),
);

function ContentDashboardRoute() {
  return (
    <Suspense fallback={null}>
      <ContentDashboard />
    </Suspense>
  );
}
