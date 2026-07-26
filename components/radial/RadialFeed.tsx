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
import { RadialWheel, type RadialWheelItem } from './RadialWheel';
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

/** First-load state: the site's liquid loading mark, centred in the feed area. */
function FeedWheelSkeleton() {
  return (
    <div className="radial-feed__skeleton">
      <RadialLoader size={72} label="Loading feed" />
    </div>
  );
}

/**
 * The radial home feed: a gently-curved column of RMHarks on the document's own
 * scroll (mobile-Safari-friendly), led by an inline compose box. The first page
 * streams in from the route loader; more pages load as you reach the end. A
 * floating compose button opens the full new-rmhark modal.
 */
export function RadialFeed({ initialFeed }: { initialFeed?: Promise<InitialFeed> | null }) {
  const { t } = useTranslation('feed');
  const [composeOpen, setComposeOpen] = useState(false);
  const openCompose = useCallback(() => setComposeOpen(true), []);

  return (
    <section className="radial-feed" aria-label={t('feed', { defaultValue: 'Feed' })}>
      {initialFeed ? (
        <Suspense fallback={<FeedWheelSkeleton />}>
          <Await promise={initialFeed}>{(data) => <FeedWheel initial={data} />}</Await>
        </Suspense>
      ) : (
        <FeedWheelSkeleton />
      )}

      <button
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
