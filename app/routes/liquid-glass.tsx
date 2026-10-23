import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildCanonical } from '@/lib/seo';

/**
 * The Liquid Glass lab moved to `/jelly` with the material (Plasmatic Jelly,
 * docs/plasmatic-jelly-system.md). The old URL stays as a redirect so links in
 * dated docs, audits and bookmarks still land on the current lab. `head()` is
 * kept so the route is never served without a title or with an indexable
 * canonical of its own.
 */
export const Route = createFileRoute('/liquid-glass')({
  beforeLoad: () => {
    throw redirect({ to: '/jelly', statusCode: 301 });
  },
  head: () => ({
    meta: [{ title: 'Plasmatic Jelly — Design Lab | RMH Studios' }, { name: 'robots', content: 'noindex' }],
    links: [buildCanonical('/jelly')],
  }),
});
