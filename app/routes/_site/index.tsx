/**
 * Home / Feed Page Route (/)
 *
 * The social feed, rendered inside the site layout (left sidebar + feed +
 * right sidebar). This is the site's root landing page.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { FeedLayout } from '@/components/feed/FeedLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { auth } from '@/lib/auth';
import { getTimeline } from '@/lib/feed/timeline';

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

// The first feed page is fetched by its own server fn so the loader can return
// it UNAWAITED (deferred) — it streams into the page after the shell instead of
// blocking the initial response.
const fetchInitialFeed = createServerFn({ method: 'GET' }).handler(async () => {
  let viewerId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    viewerId = session?.user?.id ?? null;
  } catch {
    viewerId = null;
  }
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
  // Await the sidebar so the shell renders immediately; return the feed as a
  // deferred promise so it streams in (React Suspense) without blocking the
  // first byte — the "fast shell, content streams" pattern social feeds use.
  loader: async () => {
    const sidebar = await fetchSidebarData();
    return { ...sidebar, initialFeed: fetchInitialFeed() };
  },
  head: () => ({
    meta: [
      { title: 'RMH Studios' },
      { name: 'description', content: 'The RMH Studios community feed.' },
    ],
  }),
  component: Home,
});

function Home() {
  const { officialBuilds, userBuilds, recommendedUsers, blogPosts, initialFeed } = Route.useLoaderData();

  return (
    <FeedLayout
      officialBuilds={officialBuilds}
      userBuilds={userBuilds}
      recommendedUsers={recommendedUsers}
      blogPosts={blogPosts}
      initialFeed={initialFeed}
    />
  );
}
