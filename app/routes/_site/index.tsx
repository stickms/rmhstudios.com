/**
 * Home / Feed Page Route (/)
 *
 * The RMH radial home feed: RMHarks orbit the central RMH core and spin into
 * focus. The first timeline page is streamed UNAWAITED from the loader so the
 * core paints immediately and the ring fills as the feed resolves.
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { RadialFeed } from '@/components/radial/RadialFeed';
import { getRequestSession } from '@/lib/auth-session.server';
import { getTimeline } from '@/lib/feed/timeline';

// The first feed page is fetched by its own server fn so the loader can return
// it UNAWAITED (deferred) — it streams into the wheel after the shell instead of
// blocking the initial response.
const fetchInitialFeed = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  const viewerId: string | null = session?.user?.id ?? null;
  const feed = await getTimeline({
    userId: viewerId,
    surface: 'foryou',
    filter: 'all',
    cursor: null,
    limit: 15,
    search: null,
  });
  return {
    items: feed.items,
    nextCursor: feed.nextCursor,
    hasMore: feed.hasMore,
    mutedWords: feed.mutedWords ?? [],
  };
});

export const Route = createFileRoute('/_site/')({
  // `?q=` is preserved so existing shareable search/hashtag links still resolve.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search.q === 'string' ? search.q.trim() : '';
    return q ? { q } : {};
  },
  staleTime: 60_000,
  loader: () => ({ initialFeed: fetchInitialFeed() }),
  head: () => ({
    meta: buildMeta({
      title: 'RMH Studios',
      description: 'The RMH Studios community feed.',
      path: '/',
    }),
    links: [buildCanonical('/')],
  }),
  component: Home,
});

function Home() {
  const { initialFeed } = Route.useLoaderData();
  return <RadialFeed initialFeed={initialFeed} />;
}
