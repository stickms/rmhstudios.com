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
import { getCurrentAnnouncement, hasSeenAnnouncement } from '@/lib/sitewide-announcement.server';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';
import { trackPromise } from '@/lib/route/tracked-promise';

/** What `GET /api/sitewide-announcement` would answer this viewer, summary only; `undefined` when it failed. */
async function loadAnnouncementState(
  viewerId: string | null,
): Promise<SitewideAnnouncementResponse | undefined> {
  try {
    const current = await getCurrentAnnouncement();
    if (!current) return { announcement: null, seen: false };
    const { content: _content, ...summary } = current;
    const seen = viewerId ? await hasSeenAnnouncement(viewerId, current.id) : false;
    return { announcement: summary, seen };
  } catch {
    return undefined;
  }
}

const PENDING = Symbol('pending');

// The first feed page is fetched by its own server fn so the loader can return
// it UNAWAITED (deferred): it streams into the feed after the shell instead of
// blocking the initial response.
const fetchInitialFeed = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  const viewerId: string | null = session?.user?.id ?? null;
  // The sitewide announcement is preloaded alongside the first page but never holds it up. It heads the feed, and
  // fetched on its own after hydration it can land above the composer and shove the column down; riding with the posts
  // it lands in the same swap. It is cached ~60s server-side, so it has almost always resolved by the time the timeline
  // has; when it has not, the page goes without it (`undefined`) and the client's own query fetches it.
  const announcementState = loadAnnouncementState(viewerId);
  const feed = await getTimeline({
    userId: viewerId,
    surface: 'foryou',
    filter: 'all',
    cursor: null,
    limit: 15,
    search: null,
  });
  // A promise already settled wins the race against the resolved sentinel; one still pending loses it.
  const settled = await Promise.race([announcementState, Promise.resolve(PENDING)]);
  return {
    items: feed.items,
    nextCursor: feed.nextCursor,
    hasMore: feed.hasMore,
    mutedWords: feed.mutedWords ?? [],
    announcementState: settled === PENDING ? undefined : settled,
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
