'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useFeedStore } from '@/stores/feedStore';
import type { FeedItem as FeedItemType } from '@/lib/feed-types';
import { FeedItem } from './FeedItem';
import { ArrowUp } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { PostListSkeleton } from '@/components/ui/skeletons/PostCardSkeleton';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

// useLayoutEffect warns during SSR; fall back to useEffect on the server so the
// render stays quiet, and keep pre-paint timing on the client (scrollMargin must
// be right before the virtualized rows paint).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Estimate before a row is measured. Matches `contain-intrinsic-size` on
// `.feed-card-cv` (globals.css) so the scrollbar reads similarly pre-measurement.
// Includes the floating-card top gutter (pt-3) each row carries (§8.3).
const ESTIMATED_ROW_HEIGHT = 332;
const OVERSCAN = 6;

// Module-level so it survives route unmounts (the feed store is module-scoped
// for the same reason). Two purposes:
//  - `hasClientMounted` lets a back-nav remount go STRAIGHT to the virtualized
//    render, skipping the one-shot non-virtualized pass we only need so the very
//    first client render matches the SSR HTML (hydration).
//  - `savedMeasurements` round-trips the virtualizer's measured row heights so a
//    remount restores the exact total height (and thus the exact scroll offset)
//    the reader left — measurements are keyed by post id via `getItemKey`, so
//    unchanged posts reuse their real heights and only new posts fall back to the
//    estimate.
let hasClientMounted = false;
let savedMeasurements: VirtualItem[] | undefined;

interface FeedListProps {
  /** Whether this is the Following surface — drives empty-state copy. */
  following?: boolean;
  /** Cold-start CTA: switch the viewer to the For You surface. */
  onSwitchToForYou?: () => void;
  /** Server-streamed first page (For You / all). Rendered on first paint and
   *  used to seed the store on mount, so the feed needs no client fetch. */
  initialItems?: FeedItemType[];
  initialCursor?: string | null;
  initialHasMore?: boolean;
  /** Viewer's muted words from the same payload — primes the live-SSE filter. */
  initialMutedWords?: string[];
}

export function FeedList({
  following = false,
  onSwitchToForYou,
  initialItems,
  initialCursor = null,
  initialHasMore = false,
  initialMutedWords,
}: FeedListProps) {
  const { t } = useTranslation('feed');
  const {
    items,
    loading,
    initialized,
    error,
    hasMore,
    fetchNextPage,
    retry,
    hydrate,
    pendingItems,
    flushPending,
  } = useFeedStore();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);
  // Ids of posts just flushed from the "N new" pill, so they can ease in rather
  // than pop. Cleared after the animation window.
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());

  // Before the store is seeded (the module-level store is still pristine on the
  // server render and the first client render), show the server-streamed first
  // page so posts are in the streamed HTML — no skeleton, no post-hydration
  // fetch. Only for the default For You surface the prefetch corresponds to.
  const usingInitial =
    !initialized && items.length === 0 && !following && !!initialItems && initialItems.length > 0;
  const displayItems = usingInitial ? initialItems : items;

  // ── Windowing ──────────────────────────────────────────────────────────────
  // Only visible rows (+ overscan) live in the DOM once mounted; on the server
  // and the first client (hydration) render we fall back to a plain list so the
  // SSR HTML has content and hydration matches, then flip to virtualized after
  // mount. A back-nav remount (hasClientMounted already true) starts virtualized
  // immediately so scroll restoration lands without a flash of the top.
  const [virtualized, setVirtualized] = useState(
    () => typeof window !== 'undefined' && hasClientMounted,
  );
  useEffect(() => {
    hasClientMounted = true;
    if (!virtualized) setVirtualized(true);
  }, [virtualized]);

  // The list column scrolls the WINDOW (both desktop and mobile — the mobile
  // shell scrolls the document too), so virtualize against window scroll. This
  // keeps the page scrolling normally, which is what the router's scroll
  // restoration and useScrollRestoration both drive.
  const parentRef = useRef<HTMLDivElement>(null);
  // `scrollMargin` = the list container's offset from the top of the document.
  // The window virtualizer measures item visibility against window.scrollY, so it
  // needs to know how far below the top of the page the list begins. Content
  // above the list (composer, announcements) streams in and can resize, so we
  // keep this in sync rather than measuring once.
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useWindowVirtualizer({
    count: displayItems.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    // Stable per-post key so measured heights survive reorders (new post
    // prepended) and round-trip through `initialMeasurementsCache` on remount.
    getItemKey: (index) => displayItems[index]?.id ?? index,
    scrollMargin,
    initialMeasurementsCache: savedMeasurements,
  });

  useIsoLayoutEffect(() => {
    if (!virtualized) return;
    const el = parentRef.current;
    if (!el || typeof window === 'undefined') return;
    const update = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setScrollMargin((prev) => (Math.abs(prev - top) > 1 ? top : prev));
    };
    update();
    // Height changes ABOVE the list (composer lazy-loads, announcements arrive)
    // shift where the list starts — observe the document so scrollMargin follows.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [virtualized]);

  // Persist the measured row heights when leaving the feed, so a back-nav remount
  // rebuilds the exact total height and the saved scroll offset lands on the same
  // content (no re-scroll). The virtualizer instance is stable, so a ref keeps the
  // unmount cleanup reading the live one.
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  useEffect(() => {
    return () => {
      try {
        const snap = virtualizerRef.current.takeSnapshot();
        if (snap.length > 0) savedMeasurements = snap;
      } catch {
        // best-effort — a missing snapshot only means estimate-based restore
      }
    };
  }, []);

  // Initial load. The feed store is module-level, so items survive navigation —
  // returning to the feed (back-nav) shows the cached timeline instantly and,
  // paired with the router's scroll restoration, lands you where you were.
  // Only act when there's nothing cached, so a remount never appends a
  // redundant extra page on top of what's already loaded.
  useEffect(() => {
    if (!initialFetched.current) {
      initialFetched.current = true;
      if (items.length === 0) {
        const s = useFeedStore.getState();
        // Seed from the streamed prefetch when it matches the surface the store
        // starts on (For You / all, no search) — otherwise fetch client-side.
        if (initialItems && initialItems.length > 0 && s.filter === 'all' && !s.search) {
          hydrate(initialItems, initialCursor, initialHasMore, initialMutedWords);
        } else {
          fetchNextPage();
        }
      }
    }
  }, [
    fetchNextPage,
    hydrate,
    items.length,
    initialItems,
    initialCursor,
    initialHasMore,
    initialMutedWords,
  ]);

  // Self-heal the feed when the environment recovers. Mobile browsers suspend
  // backgrounded tabs (killing an in-flight fetch), and networks drop — either
  // can leave the feed sitting on skeletons or an error. When the tab becomes
  // visible again or connectivity returns, re-drive the current surface if it's
  // in a recoverable stuck state, so it "just works" without a hard refresh.
  useEffect(() => {
    const recover = () => {
      const s = useFeedStore.getState();
      if (s.loading) return;
      const stuckOnSkeletons = !s.initialized && s.items.length === 0;
      if (s.error || stuckOnSkeletons) s.retry();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recover();
    };
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Infinite scroll via IntersectionObserver. The sentinel sits after the
  // full-height virtual container, so it only intersects at the true bottom of
  // all loaded rows — preserving the existing "fetch the next page as you near
  // the end" behavior with windowing in place.
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      // Don't auto-refetch while an error is unresolved — that would spin into a
      // tight retry loop against a failing endpoint. The retry button (or a
      // visibility/online recovery) is the way back.
      if (entries[0].isIntersecting && hasMore && !loading && !error) {
        fetchNextPage();
      }
    },
    [hasMore, loading, error, fetchNextPage],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(observerCallback, {
      rootMargin: '200px',
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback]);

  const handleShowNew = () => {
    // Tag the incoming posts so they ease in instead of popping. (A container
    // View Transition would clash with the per-image `view-transition-name`s on
    // feed cards, desyncing image vs. text — a scoped per-item enter is the
    // non-jarring option here.)
    if (!prefersReducedMotion()) {
      const flushedIds = new Set(pendingItems.map((i) => i.id));
      setEnteringIds(flushedIds);
      window.setTimeout(() => setEnteringIds(new Set()), 500);
    }
    flushPending();
    // Snap to the top so the freshly inserted posts are visible.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* "N new posts" pill — never auto-yanks the scroll (Twitter pattern) */}
      {pendingItems.length > 0 && (
        <div className="sticky top-24 z-20 mt-4 flex justify-center pointer-events-none">
          <button
            onClick={handleShowNew}
            className="pointer-events-auto flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-site-accent text-site-accent-fg text-sm font-bold shadow-site hover:bg-site-accent-hover transition-[transform,background-color] duration-150 active:scale-95"
          >
            <ArrowUp className="w-4 h-4" />
            {t('new-posts', {
              count: pendingItems.length,
              defaultValue: '{{count}} new post',
              defaultValue_plural: '{{count}} new posts',
            })}
          </button>
        </div>
      )}

      {virtualized ? (
        // Windowed list: the container reserves the full (measured) height so the
        // scrollbar and the infinite-scroll sentinel behave, and only the rows in
        // view (+ overscan) are mounted and measured. No `feed-card-cv` here — the
        // virtualizer already culls off-screen rows, and `content-visibility` would
        // report the intrinsic-size estimate for overscan rows instead of their
        // real height, corrupting measurement.
        <div
          ref={parentRef}
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((vRow) => {
            const item = displayItems[vRow.index];
            if (!item) return null;
            const entering = enteringIds.has(item.id);
            return (
              <div
                key={vRow.key}
                data-index={vRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {/* Floating-card gutter + top gap (§8.3) rides the inner element
                    so measureElement includes it (keeps virtual offsets exact).
                    Enter animation also stays here so its transform can't clobber
                    the row-positioning transform above. */}
                <div className={`px-3 pt-3 ${entering ? 'feed-item-enter' : ''}`.trim()}>
                  <FeedItem item={item} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Server render + first client (hydration) render: a plain list so the
        // streamed HTML has posts and hydration matches. `feed-card-cv` skips
        // layout/paint for cards far from the viewport until the virtualizer takes
        // over on mount. Pending (optimistic) and just-entered posts opt out —
        // they sit at the top and must render (and animate) without being skipped.
        // Floating cards float over aurora gutters (§8.3): space-y-3 gaps + px-3
        // side gutters; pt-3 gives the first card its top gap.
        <div className="space-y-3 px-3 pt-3">
          {displayItems.map((item) => {
            const entering = enteringIds.has(item.id);
            const cv = item.pending || entering ? '' : 'feed-card-cv';
            return (
              <div
                key={item.id}
                className={`${cv} ${entering ? 'feed-item-enter' : ''}`.trim() || undefined}
              >
                <FeedItem item={item} />
              </div>
            );
          })}
        </div>
      )}

      {/* Initial load → layout-matched skeletons so the feed reads as
          "content arriving" rather than a bare spinner, and the empty state
          never flashes before the first page resolves. */}
      {!initialized && items.length === 0 && !usingInitial && <PostListSkeleton count={6} />}

      {/* Pagination load (subsequent pages) keeps the compact spinner. */}
      {initialized && loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      {/* Load failure with nothing to show → offer a retry instead of leaving
          the reader stranded on skeletons or a misleading "empty" state. */}
      {error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <p className="text-lg font-medium text-site-text mb-1">
            {t('load-error-title', { defaultValue: "Couldn't load your feed" })}
          </p>
          <p className="text-sm text-site-text-muted mb-6">
            {t('load-error-subtitle', {
              defaultValue: 'Something went wrong. Check your connection and try again.',
            })}
          </p>
          <button
            onClick={retry}
            className="px-5 py-2 rounded-site-sm bg-site-accent text-site-accent-fg text-sm font-bold hover:bg-site-accent-hover transition-colors"
          >
            {t('retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}

      {/* Empty state — only after the first fetch has actually completed */}
      {initialized &&
        !loading &&
        !error &&
        items.length === 0 &&
        (following ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">
              {t('following-empty-title', { defaultValue: 'Your Following feed is quiet' })}
            </p>
            <p className="text-sm text-site-text-muted mb-6">
              {t('following-empty-subtitle', {
                defaultValue: 'Follow some people and their posts will show up here.',
              })}
            </p>
            {onSwitchToForYou && (
              <button
                onClick={onSwitchToForYou}
                className="px-5 py-2 rounded-site-sm bg-site-accent text-site-accent-fg text-sm font-bold hover:bg-site-accent-hover transition-colors"
              >
                {t('browse-for-you', { defaultValue: 'Browse For You' })}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">
              {t('for-you-empty-title', { defaultValue: 'Nothing here yet' })}
            </p>
            <p className="text-sm text-site-text-muted">
              {t('for-you-empty-subtitle', {
                defaultValue: 'Be the first to post an RMHark, or check back later!',
              })}
            </p>
          </div>
        ))}

      {/* Pagination failed but we already have posts — let the reader pull the
          next page again rather than silently stalling the infinite scroll. */}
      {error && items.length > 0 && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-site-text-muted">
            {t('load-more-error', { defaultValue: "Couldn't load more posts." })}
          </p>
          <button
            onClick={retry}
            className="px-4 py-1.5 rounded-site-sm border border-site-border bg-site-surface text-site-text text-sm font-medium hover:bg-site-surface-hover transition-colors"
          >
            {t('retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}

      {/* No more items */}
      {!hasMore && !error && items.length > 0 && (
        <div className="py-8 text-center text-sm text-site-text-dim">
          {t('reached-end', { defaultValue: "You've reached the end" })}
        </div>
      )}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
