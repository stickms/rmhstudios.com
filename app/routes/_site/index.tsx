/**
 * Home / Feed Page Route (/)
 *
 * The social feed, rendered inside the site layout (left sidebar + feed +
 * right sidebar). This is the site's root landing page.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { FeedLayout } from '@/components/feed/FeedLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { getRequestSession } from '@/lib/auth-session.server';
import { getTimeline } from '@/lib/feed/timeline';

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

// The first feed page is fetched by its own server fn so the loader can return
// it UNAWAITED (deferred) — it streams into the page after the shell instead of
// blocking the initial response.
const fetchInitialFeed = createServerFn({ method: 'GET' }).handler(async () => {
  // Shares the request-scoped session resolution with the root loader and the
  // sidebar server fn, so the homepage resolves the viewer once, not three times.
  const session = await getRequestSession();
  const viewerId: string | null = session?.user?.id ?? null;
  const feed = await getTimeline({
    userId: viewerId,
    surface: 'foryou',
    filter: 'all',
    cursor: null,
    limit: 20,
    search: null,
  });
  return { items: feed.items, nextCursor: feed.nextCursor, hasMore: feed.hasMore };
});

export const Route = createFileRoute('/_site/')({
  // `?q=` drives the feed search so a search (or hashtag click) is shareable.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search.q === 'string' ? search.q.trim() : '';
    return q ? { q } : {};
  },
  // Return BOTH the sidebar and the feed as deferred promises so neither DB
  // read blocks the first byte: the feed column + composer + skeleton paint
  // immediately and each region streams into its own <Suspense> slot. This is
  // the "fast shell, content streams" pattern social feeds use — previously the
  // awaited sidebar gated even the feed skeleton from painting.
  loader: () => ({ sidebar: fetchSidebarData(), initialFeed: fetchInitialFeed() }),
  head: () => ({
    meta: [
      { title: 'RMH Studios' },
      { name: 'description', content: 'The RMH Studios community feed.' },
    ],
  }),
  component: Home,
});

function Home() {
  const { sidebar, initialFeed } = Route.useLoaderData();

  return <FeedLayout sidebar={sidebar} initialFeed={initialFeed} />;
}
