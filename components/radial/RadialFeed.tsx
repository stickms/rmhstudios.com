'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Await } from '@tanstack/react-router';
import { ArrowUp, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { useCaughtUpMarker } from '@/hooks/useCaughtUpMarker';
import { CaughtUpDivider } from '@/components/feed/CaughtUpDivider';
import { type InitialFeed } from '@/components/feed/FeedColumn';
import { ComposeBoxLazy } from '@/components/feed/ComposeBoxLazy';
import { QotdCardLazy } from '@/components/posts-plus/QotdCardLazy';
import { FortuneCardLazy } from '@/components/delight/FortuneCardLazy';
import { useSession } from '@/components/Providers';
import { PageTabs } from '@/components/feed/PageTabs';
import { RadialLoader } from '@/components/ui/radial-loader';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeferOnNavigate } from '@/components/ui/defer-on-navigate';
import { scrollPageToTop, useBackToTopHost } from '@/components/ui/back-to-top';
import { useViewportShift } from '@/hooks/useViewportShift';
import { RadialWheel, type RadialWheelItem } from './RadialWheel';
import { WheelCard } from './WheelCard';

/** X4: the question-of-the-day card follows this many posts. */
const QOTD_AFTER = 3;
// Z4: the fortune cookie sits further down, safely below the fold.
const FORTUNE_AFTER = 6;
/**
 * Wheel entries built inside a page switch's own commit; the rest of the page
 * of results follows in a time-sliced transition (`useDeferOnNavigate`). Four
 * covers the first screen at every width — the compose box plus three or four
 * cards — so nothing the reader can see arrives late.
 */
const FIRST_SCREEN_ENTRIES = 4;
/** What FeedWheel is handed when the store already has the timeline (see RadialFeed). */
const NO_STREAMED_PAGE: InitialFeed = { items: [], nextCursor: null, hasMore: false };

// The full composer is a heavy chunk (GIF picker, AI buttons, mention/emoji
// autocomplete) — defer it out of the feed route's initial bundle; it only
// mounts when someone actually opens it from the compose button.
const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({ default: m.ComposeModal })),
);

/**
 * Should this render show the server-streamed first page instead of the store?
 *
 * The store is seeded from the streamed page by an effect — and effects never run
 * during SSR. Reading the store alone therefore put the SKELETON in the server
 * HTML on every cold load of `/`, so the real rmharks appeared only once the entry
 * bundle had downloaded, parsed and hydrated. Preferring the streamed page while
 * the store is still pristine puts the first page of cards in the SSR markup,
 * which is the entire point of streaming it. (`FeedList` — the classic column —
 * has always done this; only the radial home was missing it.)
 *
 * The surface guard is load-bearing, not defensive. `setFilter`/`setSearch`
 * (stores/feedStore.ts) both reset to `items: []` + `initialized: false` before
 * they fetch, which re-satisfies "pristine store" on a surface the streamed
 * For-You page does not describe — so without the `filter`/`search` check, asking
 * for a filtered or searched feed would flash the old For-You posts back up.
 *
 * Exported for `lib/__tests__/feed-first-paint.test.ts`: the SSR win and that
 * flash are both invisible in a unit render of the component, so the predicate is
 * pinned directly.
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

/**
 * The live feed. It renders off the shared `feedStore`, so every existing feed
 * behaviour keeps working: the streamed first page hydrates the store, live SSE
 * ticks flow through (`useFeedSSE`), and reaching the end of the loaded set
 * lazily fetches the next page.
 */
function FeedWheel({ initial }: { initial: InitialFeed }) {
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

  const usingInitial = shouldUseStreamedPage({
    initialized,
    storeCount: storeItems.length,
    filter,
    search,
    streamedCount: initial.items.length,
  });
  const items = usingInitial ? initial.items : storeItems;

  // Live real-time stream (likes/comments/reposts/new posts), same as the classic feed.
  useFeedSSE();

  // Seed the module-level store from the streamed prefetch exactly once, mirroring
  // FeedList: only when nothing is cached and the store sits on the matching
  // surface (For You / all, no search). Otherwise fetch client-side.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const s = useFeedStore.getState();
    if (s.items.length > 0) return; // cached from a previous visit — keep it
    if (initial.items.length > 0 && s.filter === 'all' && !s.search) {
      hydrate(initial.items, initial.nextCursor, initial.hasMore, initial.mutedWords);
    } else {
      fetchNextPage();
    }
  }, [initial, hydrate, fetchNextPage]);

  // Infinite scroll: the wheel fires this as its sentinel nears the viewport.
  // `fetchNextPage` no-ops when already loading or drained.
  const onEndReached = useCallback(() => {
    const s = useFeedStore.getState();
    if (s.hasMore && !s.loading) void s.fetchNextPage();
  }, []);

  // X7: the "You're all caught up" divider goes before the first post from the
  // previous visit. Plain For You home only — a filtered or searched surface has
  // no "new since last time".
  const caughtUpBeforeId = useCaughtUpMarker(items, filter === 'all' && !search);
  // X4 slot only for signed-in members on the plain For You view — signed-out
  // visitors can't answer, and an empty slot would still take the wheel's gap.
  const { data: session } = useSession();
  const showQotd = !!session && filter === 'all' && !search;
  const showFortune = filter === 'all' && !search;

  const wheelItems = useMemo<RadialWheelItem[]>(
    () =>
      items.flatMap((item, i) => {
        const card = { id: item.id, node: <WheelCard item={item} /> };
        const out =
          item.id === caughtUpBeforeId
            ? [{ id: 'caught-up-divider', node: <CaughtUpDivider /> }, card]
            : [card];
        // X4: today's question sits after the third post, never above the
        // composer. It mounts after idle, and anything that appears after paint
        // at the top of the feed shoves the whole column down (layout shift on
        // the busiest page); three cards in, it only moves what is below the fold.
        if (showQotd && i === QOTD_AFTER - 1) out.push({ id: 'qotd-card', node: <QotdCardLazy /> });
        if (showFortune && i === FORTUNE_AFTER - 1)
          out.push({ id: 'fortune-card', node: <FortuneCardLazy /> });
        return out;
      }),
    [items, caughtUpBeforeId, showQotd, showFortune],
  );

  // On a page switch, the first screen of the wheel is built in the click's own
  // commit and the remaining ~11 cards a moment later in a transition React
  // time-slices — fifteen full RMHark cards in one synchronous commit was the
  // bulk of the switch's long task (docs/performance-audit-2026-10-21.md
  // §Navigation commit). Never on first load or back/forward, see
  // `useDeferOnNavigate`.
  const wheelReady = useDeferOnNavigate();
  const shownItems = wheelReady ? wheelItems : wheelItems.slice(0, FIRST_SCREEN_ENTRIES);

  // The inline "rmhark compose box" that heads the feed — the first rmhark comes
  // right after it. ComposeBoxLazy handles the signed-out state itself (same as
  // the classic feed column).
  const composeLead = (
    <>
      <ComposeBoxLazy />
    </>
  );

  if (wheelItems.length === 0) {
    // Distinguish a genuine empty timeline from a first-load error.
    if (error && initialized) {
      return (
        <div className="radial-feed__empty">
          <FeedGlyph />
          <p>{t('feed-error', { defaultValue: 'Could not load the feed.' })}</p>
          <button type="button" className="radial-feed__compose-btn" onClick={() => retry()}>
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        </div>
      );
    }
    if (initialized && !loading) {
      // Empty timeline: lead with the compose box so posting is the first move.
      return (
        <RadialWheel
          items={[]}
          lead={composeLead}
          ariaLabel={t('feed', { defaultValue: 'Feed' })}
        />
      );
    }
    return <FeedWheelSkeleton />;
  }

  return (
    <RadialWheel
      items={shownItems}
      lead={composeLead}
      // Not while the wheel is still partial: four cards put the sentinel inside
      // its 800px margin and would fetch a second page in the middle of the switch.
      onEndReached={wheelReady ? onEndReached : undefined}
      haptics
      ariaLabel={t('feed', { defaultValue: 'Feed' })}
    >
      {!wheelReady && (
        <div aria-hidden data-slot="defer-placeholder" style={{ minHeight: '100vh' }} />
      )}
    </RadialWheel>
  );
}

function FeedGlyph() {
  return (
    <div className="radial-core" aria-hidden>
      <span className="radial-core__mark">RMH</span>
    </div>
  );
}

/**
 * First-load state.
 *
 * This used to be the liquid loading mark alone, centred in an otherwise blank
 * column: no composer, no card shapes, nothing to say what was coming. Two
 * consequences, both measured — swapping the whole viewport for the real feed
 * shifted layout by 0.13–0.21 CLS on phones, and frozen mid-morph the goo mark
 * reads as an ink-blot glitch rather than progress.
 *
 * Card skeletons matching `.rmhark`'s geometry keep the column's shape from the
 * first frame, so the real cards land in place. The loading mark stays as the
 * motion cue, above them.
 */
function FeedWheelSkeleton() {
  const { t } = useTranslation('feed');
  return (
    <div className="radial-feed__skeleton" aria-busy="true" aria-live="polite">
      <RadialLoader size={56} label={t('loading-feed', { defaultValue: 'Loading feed' })} />
      <div className="radial-feed__skeleton-cards" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rmhark rmhark--skeleton">
            <div className="rmhark__head">
              <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The radial home feed: a gently-curved column of RMHarks on the document's own
 * scroll (mobile-Safari-friendly), led by an inline compose box. The first page
 * streams in from the route loader; more pages load as you reach the end. A
 * floating compose button opens the full new-rmhark modal.
 *
 * On a wide screen home becomes a **deck**: the wheel keeps the primary column
 * and a second, independent feed (Following · News · Games) runs beside it. The
 * deck is a two-track grid, so the secondary column can never ride over the
 * wheel; below the deck breakpoint the second track simply isn't rendered and
 * home is the single mobile column it has always been.
 */
export function RadialFeed({ initialFeed }: { initialFeed?: Promise<InitialFeed> | null }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const filter = useFeedStore((s) => s.filter);
  const setFilter = useFeedStore((s) => s.setFilter);
  // Coming back to `/` within a visit, the store already holds the timeline —
  // and FeedWheel renders from the store whenever it has items, ignoring the
  // streamed page entirely. Waiting on `<Await>` for that page anyway put the
  // skeleton up for the fetch (≥300ms with React's fallback throttle) in front
  // of posts that were already in memory. Read once at mount, so the branch can
  // never flip and remount the wheel; always false under SSR and hydration,
  // where the store is pristine.
  const [storeHasFeed] = useState(() => {
    const s = useFeedStore.getState();
    return s.initialized && s.items.length > 0;
  });
  const [composeOpen, setComposeOpen] = useState(false);
  const openCompose = useCallback(() => setComposeOpen(true), []);

  // The scrolled-down arrow is part of the compose pill (below): it grows out of it when the page is
  // scrolled and folds back at the top. Registering as the host keeps the shell's own arrow from drawing.
  const scrolled = useBackToTopHost();
  const fabRef = useRef<HTMLDivElement | null>(null);
  useViewportShift(fabRef);

  return (
    <section className="radial-feed" aria-label={t('feed', { defaultValue: 'Feed' })}>
      {/* The home page's heading outline used to start at a 10px rail caption
          (an h2), because nothing on the feed is a visible page title. */}
      <h1 className="sr-only">{t('feed', { defaultValue: 'Feed' })}</h1>
      <PageTabs
        tabs={[
          { id: 'all', label: t('feed-for-you', { defaultValue: 'For you' }) },
          ...(session
            ? [{ id: 'friends', label: t('feed-following', { defaultValue: 'Following' }) }]
            : []),
        ]}
        value={filter === 'friends' ? 'friends' : 'all'}
        onChange={(id) => setFilter(id === 'friends' ? 'friends' : 'all')}
        aria-label={t('feed-view-heading-rewrite', { defaultValue: 'Choose your feed' })}
      />
      <div className="radial-feed__deck">
        <div className="radial-feed__primary">
          {storeHasFeed ? (
            <FeedWheel initial={NO_STREAMED_PAGE} />
          ) : initialFeed ? (
            <Suspense fallback={<FeedWheelSkeleton />}>
              <Await promise={initialFeed}>{(data) => <FeedWheel initial={data} />}</Await>
            </Suspense>
          ) : (
            <FeedWheelSkeleton />
          )}
        </div>
      </div>

      {/* One floating control: the compose pill, with the back-to-top arrow growing out of its left end when
          the page is scrolled and folding back into it at the top (radial.css). The pill is the jelly body. */}
      <div ref={fabRef} className="radial-feed__compose" data-fluid-press="" data-evert="">
        <button
          type="button"
          className="radial-feed__fab-top"
          data-shown={scrolled || undefined}
          tabIndex={scrolled ? 0 : -1}
          onClick={scrollPageToTop}
          aria-label={t('back-to-top', { ns: 'c-ui', defaultValue: 'Back to top' })}
        >
          <ArrowUp aria-hidden />
        </button>
        <button
          type="button"
          className="radial-feed__fab-action"
          onClick={openCompose}
          aria-label={t('compose', { defaultValue: 'Compose' })}
          aria-haspopup="dialog"
        >
          <PenLine aria-hidden />
          <span className="radial-feed__compose-label">
            {t('compose', { defaultValue: 'Compose' })}
          </span>
        </button>
      </div>

      {composeOpen && (
        <Suspense fallback={null}>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}
