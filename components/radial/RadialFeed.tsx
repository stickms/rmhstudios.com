'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Await } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { type InitialFeed } from '@/components/feed/FeedColumn';
import { ComposeBoxLazy } from '@/components/feed/ComposeBoxLazy';
import { RadialLoader } from '@/components/ui/radial-loader';
import { Skeleton } from '@/components/ui/skeleton';
import { RadialWheel, type RadialWheelItem } from './RadialWheel';
import { RadialSideFeed } from './RadialSideFeed';
import { RmharkCard } from './RmharkCard';

// The full composer is a heavy chunk (GIF picker, AI buttons, mention/emoji
// autocomplete) — defer it out of the feed route's initial bundle; it only
// mounts when someone actually opens it from the compose button.
const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({ default: m.ComposeModal })),
);

/**
 * The live feed. It renders off the shared `feedStore`, so every existing feed
 * behaviour keeps working: the streamed first page hydrates the store, live SSE
 * ticks flow through (`useFeedSSE`), and reaching the end of the loaded set
 * lazily fetches the next page.
 */
function FeedWheel({ initial }: { initial: InitialFeed }) {
  const { t } = useTranslation('feed');
  const items = useFeedStore((s) => s.items);
  const loading = useFeedStore((s) => s.loading);
  const error = useFeedStore((s) => s.error);
  const initialized = useFeedStore((s) => s.initialized);
  const hydrate = useFeedStore((s) => s.hydrate);
  const fetchNextPage = useFeedStore((s) => s.fetchNextPage);
  const retry = useFeedStore((s) => s.retry);
  const seeded = useRef(false);

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

  const wheelItems = useMemo<RadialWheelItem[]>(
    () => items.map((item) => ({ id: item.id, node: <RmharkCard item={item} /> })),
    [items],
  );

  // The inline "rmhark compose box" that heads the feed — the first rmhark comes
  // right after it. ComposeBoxLazy handles the signed-out state itself (same as
  // the classic feed column).
  const composeLead = <ComposeBoxLazy />;

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
      items={wheelItems}
      lead={composeLead}
      onEndReached={onEndReached}
      haptics
      ariaLabel={t('feed', { defaultValue: 'Feed' })}
    />
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
  const [composeOpen, setComposeOpen] = useState(false);
  const openCompose = useCallback(() => setComposeOpen(true), []);
  const composeRef = useRef<HTMLButtonElement | null>(null);

  // Publish the compose button's footprint so back-to-top can sit on the row
  // BESIDE it rather than floating above it (globals.css §5.5x A.1,
  // `.floating-fab-lane`). CSS cannot derive this number: the FAB is icon-only
  // below 560px, gains a label above it, and that label is translated — so the
  // width depends on the active locale. Measured instead, on the element that
  // knows: one ResizeObserver, which fires on breakpoint and locale changes and
  // at no other time. Cleared on unmount, so every page without a compose FAB
  // falls back to the `0px` default and back-to-top keeps the right edge.
  useEffect(() => {
    const el = composeRef.current;
    const root = document.documentElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const publish = () => {
      root.style.setProperty(
        '--float-fab-lane',
        `calc(${el.offsetWidth}px + var(--site-fab-row-gap))`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--float-fab-lane');
    };
  }, []);

  return (
    <section className="radial-feed" aria-label={t('feed', { defaultValue: 'Feed' })}>
      {/* The home page's heading outline used to start at a 10px rail caption
          (an h2), because nothing on the feed is a visible page title. */}
      <h1 className="sr-only">{t('feed', { defaultValue: 'Feed' })}</h1>
      <div className="radial-feed__deck">
        <div className="radial-feed__primary">
          {initialFeed ? (
            <Suspense fallback={<FeedWheelSkeleton />}>
              <Await promise={initialFeed}>{(data) => <FeedWheel initial={data} />}</Await>
            </Suspense>
          ) : (
            <FeedWheelSkeleton />
          )}
        </div>
        <RadialSideFeed />
      </div>

      <button
        ref={composeRef}
        type="button"
        className="radial-feed__compose"
        onClick={openCompose}
        aria-label={t('compose', { defaultValue: 'Compose' })}
        aria-haspopup="dialog"
      >
        <PenLine aria-hidden />
        <span className="radial-feed__compose-label">
          {t('compose', { defaultValue: 'Compose' })}
        </span>
      </button>

      {composeOpen && (
        <Suspense fallback={null}>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}
