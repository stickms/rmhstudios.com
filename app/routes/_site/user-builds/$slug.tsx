import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * `/user-builds/$slug` → `/builds/$slug`.
 *
 * A build has one detail page, `/builds/$slug`, which resolves official catalog
 * builds and member builds alike (2026-11-19 consolidation). This stays as a
 * redirect rather than being deleted: every `rmhcode push` before then printed
 * `/user-builds/<slug>` as the build's address, and shared links, notifications
 * and stored prediction markets name it too. It carries the slug, so it is a
 * route file and not a LEGACY_REDIRECTS row.
 */
export const Route = createFileRoute('/_site/user-builds/$slug')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/builds/$slug', params: { slug: params.slug }, replace: true });
  },
});
