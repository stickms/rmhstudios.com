/**
 * Home / Feed Page Route (/)
 *
 * The home feed (Steel X1): the feed itself, with no hero, masthead or stories above it. The first timeline page is
 * streamed UNAWAITED from the loader so the page paints immediately and the feed fills as it resolves.
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { HomeFeed } from '@/components/feed/HomeFeed';
import { getRequestSession } from '@/lib/auth-session.server';
import { getTimeline } from '@/lib/feed/timeline';
import { getCurrentAnnouncement } from '@/lib/sitewide-announcement.server';
import { trackPromise } from '@/lib/route/tracked-promise';

// The first feed page is fetched by its own server fn so the loader can return
// it UNAWAITED (deferred): it streams into the feed after the shell instead of
// blocking the initial response.
const fetchInitialFeed = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  const viewerId: string | null = session?.user?.id ?? null;
  // The live sitewide announcement rides with the first page (it is cached ~60s server-side): it heads the feed, and
  // fetched on its own after idle it landed above the composer and shoved the whole column down. Arriving with the
  // posts it lands in the same swap as they do. A failure is just no announcement; the row's own query still runs.
  const [feed, current] = await Promise.all([
    getTimeline({
      userId: viewerId,
      surface: 'foryou',
      filter: 'all',
      cursor: null,
      limit: 15,
      search: null,
    }),
    getCurrentAnnouncement().catch(() => null),
  ]);
  const announcement = current ? (({ content: _content, ...summary }) => summary)(current) : null;
  return {
    items: feed.items,
    nextCursor: feed.nextCursor,
    hasMore: feed.hasMore,
    mutedWords: feed.mutedWords ?? [],
    announcement,
  };
});

export const Route = createFileRoute('/_site/')({
  // `?q=` is preserved so existing shareable search/hashtag links still resolve.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search.q === 'string' ? search.q.trim() : '';
    return q ? { q } : {};
  },
  staleTime: 60_000,
  // Tracked so a preloaded (hover) or still-fresh feed renders in the click's
  // own commit instead of suspending into the skeleton — see trackPromise.
  loader: () => ({ initialFeed: trackPromise(fetchInitialFeed()) }),
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
  // On first load the loader never ran here: this is the router's copy of the
  // streamed promise, deserialized from the SSR payload and untracked. Tracking
  // it before `<Await>` reads it lets hydration take the already-streamed page
  // synchronously, so the server-rendered feed hydrates in place instead of
  // suspending and being client-rendered over (docs/archive/2026/performance-audit-2026-10-21.md
  // §Home LCP). Idempotent, and a no-op on the server.
  trackPromise(initialFeed);
  return <HomeFeed initialFeed={initialFeed} />;
}
