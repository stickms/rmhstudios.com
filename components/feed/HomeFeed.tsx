import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Await } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { useCaughtUpMarker } from '@/hooks/useCaughtUpMarker';
import { useSession } from '@/components/Providers';
import { usePreloadedSitewideAnnouncement } from '@/hooks/useSitewideAnnouncement';
import { ArrivalSuspense, useArrival, useArrivingKeys, useSuspenseArrival } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spine, SpineItem } from '@/components/ui/spine';
import { Tabs } from '@/components/ui/tabs';
import { useDeferOnNavigate } from '@/components/ui/defer-on-navigate';
import { QotdCardLazy } from '@/components/posts-plus/QotdCardLazy';
import { FortuneCardLazy } from '@/components/delight/FortuneCardLazy';
import type { FeedItem } from '@/lib/feed-types';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';
import { CaughtUpDivider } from './CaughtUpDivider';
import { FeedRow } from './FeedRow';
import { HomeComposer } from './HomeComposer';
import { SitewideAnnouncementRow } from './SitewideAnnouncementRow';

/** The server-streamed first page (For You / all), resolved via <Await>. */
export interface InitialFeed {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Viewer's muted words, so the client primes its live-SSE filter with no separate request. */
  mutedWords?: string[];
  /**
   * The sitewide announcement as the viewer's own query would answer it, preloaded with this page so the row heading the
   * feed lands with the posts and the popup needs no request. Absent when it was not ready in time (it never delays the
   * page); the query then fetches it.
   */
  announcementState?: SitewideAnnouncementResponse | undefined;
}

/** X4: the question-of-the-day card follows this many posts. */
const QOTD_AFTER = 3;
/** Z4: the fortune cookie sits further down, safely below the fold. */
const FORTUNE_AFTER = 6;
/**
 * Rows built inside a page switch's own commit; the rest of the page of results follows in a time-sliced transition
 * (`useDeferOnNavigate`). Four covers the first screen at every width, so nothing the reader can see arrives late.
 */
const FIRST_SCREEN_ENTRIES = 4;
/** What FeedBody is handed when the store already has the timeline (see HomeFeed). */
const NO_STREAMED_PAGE: InitialFeed = { items: [], nextCursor: null, hasMore: false };

/**
 * Should this render show the server-streamed first page instead of the store?
 *
 * The store is seeded from the streamed page by an effect, and effects never run during SSR. Reading the store alone
 * therefore put the SKELETON in the server HTML on every cold load of `/`, so the real posts appeared only once the entry
 * bundle had downloaded, parsed and hydrated. Preferring the streamed page while the store is still pristine puts the
 * first page of posts in the SSR markup, which is the entire point of streaming it.
 *
 * The surface guard is load-bearing, not defensive. `setFilter`/`setSearch` (stores/feedStore.ts) both reset to
 * `items: []` + `initialized: false` before they fetch, which re-satisfies "pristine store" on a surface the streamed
 * For-You page does not describe, so without the `filter`/`search` check, asking for a filtered or searched feed would
 * flash the old For-You posts back up.
 *
 * Exported for `lib/__tests__/feed-first-paint.test.ts`: the SSR win and that flash are both invisible in a unit render of
 * the component, so the predicate is pinned directly.
 */
export function shouldUseStreamedPage({
  initialized,
  storeCount,
  filter,
  search,
  streamedCount,
}: {
  initialized: boolean;
  storeCount: number;
  filter: string;
  search: string | null;
  streamedCount: number;
}): boolean {
  return !initialized && storeCount === 0 && filter === 'all' && !search && streamedCount > 0;
}

type Entry = { id: string; node: React.ReactNode };

/**
 * The live feed. It renders off the shared `feedStore`, so every existing feed behaviour keeps working: the streamed
 * first page hydrates the store, live SSE ticks flow through (`useFeedSSE`), and reaching the end of the loaded set
 * fetches the next page.
 */
function FeedBody({ initial }: { initial: InitialFeed }) {
  const { t } = useTranslation('feed');
  const storeItems = useFeedStore((s) => s.items);
  const loading = useFeedStore((s) => s.loading);
  const error = useFeedStore((s) => s.error);
  const initialized = useFeedStore((s) => s.initialized);
  const filter = useFeedStore((s) => s.filter);
  const search = useFeedStore((s) => s.search);
  const hydrate = useFeedStore((s) => s.hydrate);
  const fetchNextPage = useFeedStore((s) => s.fetchNextPage);
  const retry = useFeedStore((s) => s.retry);
  const seeded = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const usingInitial = shouldUseStreamedPage({
    initialized,
    storeCount: storeItems.length,
    filter,
    search,
    streamedCount: initial.items.length,
  });
  const items = usingInitial ? initial.items : storeItems;

  // Live real-time stream (likes, comments, reposts, new posts).
  useFeedSSE();

  // Seed the module-level store from the streamed prefetch exactly once: only when nothing is cached and the store sits
  // on the matching surface (For You, no search). Otherwise fetch client-side.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const s = useFeedStore.getState();
    if (s.items.length > 0) return; // cached from a previous visit: keep it
    if (initial.items.length > 0 && s.filter === 'all' && !s.search) {
      hydrate(initial.items, initial.nextCursor, initial.hasMore, initial.mutedWords);
    } else {
      fetchNextPage();
    }
  }, [initial, hydrate, fetchNextPage]);

  // The preloaded announcement answers the shared query (the popup reads it too), so nothing fetches it again.
  usePreloadedSitewideAnnouncement(initial.announcementState);

  // X7: the "You're all caught up" row goes before the first post from the previous visit. Plain For You home only: a
  // filtered or searched surface has no "new since last time".
  const caughtUpBeforeId = useCaughtUpMarker(items, filter === 'all' && !search);
  // X4 slot only for signed-in members on the plain For You view: signed-out visitors can't answer.
  const { data: session } = useSession();
  const showQotd = !!session && filter === 'all' && !search;
  const showFortune = filter === 'all' && !search;

  const entries = useMemo<Entry[]>(
    () =>
      items.flatMap((item, i) => {
        const row: Entry = { id: item.id, node: <FeedRow item={item} /> };
        const out: Entry[] =
          item.id === caughtUpBeforeId
            ? [{ id: 'caught-up-divider', node: <CaughtUpDivider /> }, row]
            : [row];
        // X4: today's question sits after the third post, never above the composer. It mounts after idle, and anything
        // that appears after paint at the top of the feed shoves the column down; three rows in, it only moves what is
        // below the fold.
        if (showQotd && i === QOTD_AFTER - 1) out.push({ id: 'qotd-card', node: <QotdCardLazy /> });
        if (showFortune && i === FORTUNE_AFTER - 1)
          out.push({ id: 'fortune-card', node: <FortuneCardLazy /> });
        return out;
      }),
    [items, caughtUpBeforeId, showQotd, showFortune],
  );

  // On a page switch, the first screen of the feed is built in the click's own commit and the rest a moment later in a
  // transition React time-slices. Never on first load or back/forward, see `useDeferOnNavigate`.
  const ready = useDeferOnNavigate();
  const shown = ready ? entries : entries.slice(0, FIRST_SCREEN_ENTRIES);

  // Steel M9: posts that land after the skeleton fade in. Streamed into the server HTML after the shell, that is the
  // class `useSuspenseArrival` writes there; fetched here after a tab switch or a cold store, it is `useArrival`. Rows
  // that join a feed already showing (the next page, a live post) fade one by one.
  const streamedArrival = useSuspenseArrival();
  const fetchedArrival = useArrival(entries.length > 0);
  const feedArrival = streamedArrival ?? fetchedArrival;
  const arrived = useArrivingKeys(entries.map((e) => e.id));

  // Infinite scroll: fetch the next page as the sentinel nears the viewport. `fetchNextPage` no-ops when already loading
  // or drained. Not while the feed is still partial: four rows put the sentinel inside its margin and would fetch a
  // second page in the middle of the switch.
  const onEndReached = useCallback(() => {
    const s = useFeedStore.getState();
    if (s.hasMore && !s.loading) void s.fetchNextPage();
  }, []);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !ready || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (hits) => {
        if (hits.some((h) => h.isIntersecting)) onEndReached();
      },
      { root: null, rootMargin: '800px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [ready, onEndReached, entries.length]);

  const label = t('feed', { defaultValue: 'Feed' });
  // The live sitewide announcement leads the feed, above the composer. Not in a search, which is a result list.
  const pinned = search ? null : (
    <SitewideAnnouncementRow
      initial={initial.announcementState?.announcement}
      className={streamedArrival}
    />
  );

  if (entries.length === 0) {
    if (error && initialized) {
      return (
        <Spine>
          {pinned}
          <HomeComposer />
          <SpineItem dot={false}>
            <p className="t-body">{t('feed-error', { defaultValue: 'Could not load the feed.' })}</p>
            <Button className="mt-3" onClick={() => retry()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          </SpineItem>
        </Spine>
      );
    }
    if (initialized && !loading) {
      // An empty timeline: the composer is the first move.
      return (
        <Spine>
          {pinned}
          <HomeComposer />
        </Spine>
      );
    }
    return <FeedSkeleton />;
  }

  return (
    <Spine>
      {pinned}
      <HomeComposer />
      {/* A virtual item (the question card, the fortune, the caught-up row) renders its own spine item, or nothing. */}
      {/* The server's class stays through hydration, which renders without the streamed fallback. */}
      <div role="feed" aria-label={label} className={feedArrival} suppressHydrationWarning>
        {shown.map((entry) =>
          arrived(entry.id) ? (
            <div key={entry.id} className="arrive-group">
              {entry.node}
            </div>
          ) : (
            <Fragment key={entry.id}>{entry.node}</Fragment>
          ),
        )}
      </div>
      <div ref={sentinelRef} aria-hidden />
      {!ready && <div aria-hidden data-slot="defer-placeholder" style={{ minHeight: '100vh' }} />}
    </Spine>
  );
}

/**
 * First-load state: still blocks in the shape of the rows, so the real posts land in place. A skeleton is a still
 * `--site-bg-subtle` block (M6): nothing shimmers.
 */
function FeedSkeleton() {
  const { t } = useTranslation('feed');
  return (
    <Spine aria-busy="true" aria-label={t('loading-feed', { defaultValue: 'Loading feed' })}>
      <HomeComposer />
      {[0, 1, 2].map((i) => (
        <SpineItem key={i} aria-hidden>
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <Skeleton className="mt-3 h-3.5 w-full" />
          <Skeleton className="mt-2 h-3.5 w-11/12" />
          <Skeleton className="mt-2 h-3.5 w-2/3" />
        </SpineItem>
      ))}
    </Spine>
  );
}

/**
 * The home page (Steel section 10, Home; X1): the feed, with nothing above it. The title "Today" is on a phone only (on
 * desktop the sidebar already says where you are, so the heading stays for screen readers alone), then the tabs
 * "For you / Following", then the feed on its spine, led on desktop by the one-line composer. The first page streams in
 * from the route loader; more pages load as you reach the end.
 */
export function HomeFeed({ initialFeed }: { initialFeed?: Promise<InitialFeed> | null }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const filter = useFeedStore((s) => s.filter);
  const setFilter = useFeedStore((s) => s.setFilter);
  // Coming back to `/` within a visit, the store already holds the timeline, and FeedBody renders from the store
  // whenever it has items, ignoring the streamed page. Waiting on `<Await>` for that page anyway put the skeleton up for
  // the fetch in front of posts that were already in memory. Read once at mount, so the branch can never flip and
  // remount the feed; always false under SSR and hydration, where the store is pristine.
  const [storeHasFeed] = useState(() => {
    const s = useFeedStore.getState();
    return s.initialized && s.items.length > 0;
  });

  const tab = filter === 'friends' ? 'friends' : 'all';

  return (
    <section data-slot="site-main-column" aria-labelledby="home-title">
      <h1 id="home-title" className="t-title lg:sr-only">
        {t('feed-today', { defaultValue: 'Today' })}
      </h1>
      <div className="mt-4 mb-3 lg:mt-0">
        <Tabs
          tabs={[
            { id: 'all', label: t('feed-for-you', { defaultValue: 'For you' }) },
            ...(session
              ? [{ id: 'friends', label: t('feed-following', { defaultValue: 'Following' }) }]
              : []),
          ]}
          value={tab}
          onChange={(id) => setFilter(id === 'friends' ? 'friends' : 'all')}
          idBase="home"
          aria-label={t('feed-view-heading-rewrite', { defaultValue: 'Choose your feed' })}
        />
      </div>
      <div role="tabpanel" id={`home-panel-${tab}`} aria-labelledby={`home-tab-${tab}`}>
        {storeHasFeed ? (
          <FeedBody initial={NO_STREAMED_PAGE} />
        ) : initialFeed ? (
          <ArrivalSuspense fallback={<FeedSkeleton />} wrap={false}>
            <Await promise={initialFeed}>{(data) => <FeedBody initial={data} />}</Await>
          </ArrivalSuspense>
        ) : (
          <FeedSkeleton />
        )}
      </div>
    </section>
  );
}
