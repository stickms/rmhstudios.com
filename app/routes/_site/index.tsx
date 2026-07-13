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

// Resolve the session once, then prefetch the sidebar AND the first feed page
// (For You / all) in parallel. Server-rendering the first page removes the
// post-hydration client fetch that made the feed appear only after a round-trip.
const fetchHomeData = createServerFn({ method: 'GET' }).handler(async () => {
  let viewerId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    viewerId = session?.user?.id ?? null;
  } catch {
    viewerId = null;
  }

  const [sidebar, feed] = await Promise.all([
    getSidebarData(viewerId),
    getTimeline({ userId: viewerId, surface: 'foryou', filter: 'all', cursor: null, limit: 20, search: null }),
  ]);

  return {
    ...sidebar,
    initialFeed: { items: feed.items, nextCursor: feed.nextCursor, hasMore: feed.hasMore },
  };
});

export const Route = createFileRoute('/_site/')({
  // `?q=` drives the feed search so a search (or hashtag click) is shareable.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search.q === 'string' ? search.q.trim() : '';
    return q ? { q } : {};
  },
  loader: () => fetchHomeData(),
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
