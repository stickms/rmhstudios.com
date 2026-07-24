'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Await, Link } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedSSE } from '@/hooks/useFeedSSE';
import { type InitialFeed } from '@/components/feed/FeedColumn';
import { RadialWheel, type RadialWheelItem } from './RadialWheel';
import { RmharkCard } from './RmharkCard';

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

  if (wheelItems.length === 0) {
    // Distinguish a genuine empty timeline from a first-load error.
    if (error && initialized) {
      return (
        <div className="radial-feed__empty">
          <FeedGlyph />
          <p>{t('feed-error', { defaultValue: 'Could not load the feed.' })}</p>
          <button type="button" className="radial-feed__compose" onClick={() => retry()}>
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        </div>
      );
    }
    if (initialized && !loading) {
      return (
        <div className="radial-feed__empty">
          <FeedGlyph />
          <p>{t('feed-empty', { defaultValue: 'Nothing here yet. Be the first to post.' })}</p>
          <Link to="/create" className="radial-feed__compose">
            <PenLine aria-hidden />
            {t('compose', { defaultValue: 'Compose' })}
          </Link>
        </div>
      );
    }
    return <FeedWheelSkeleton />;
  }

  return (
    <RadialWheel
      items={wheelItems}
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

function FeedWheelSkeleton() {
  return (
    <div className="radial-feed__skeleton" aria-hidden>
      <div className="radial-core">
        <span className="radial-core__mark">RMH</span>
      </div>
    </div>
  );
}

/**
 * The radial home feed: a gently-curved column of RMHarks on native momentum
 * scroll. The first page streams in from the route loader; more pages load as
 * you reach the end.
 */
export function RadialFeed({ initialFeed }: { initialFeed?: Promise<InitialFeed> | null }) {
  const { t } = useTranslation('feed');

  return (
    <section className="radial-feed" aria-label={t('feed', { defaultValue: 'Feed' })}>
      <header className="radial-feed__head">
        <Link to="/create" className="radial-feed__compose">
          <PenLine aria-hidden />
          {t('compose', { defaultValue: 'Compose' })}
        </Link>
      </header>

      {initialFeed ? (
        <Suspense fallback={<FeedWheelSkeleton />}>
          <Await promise={initialFeed}>{(data) => <FeedWheel initial={data} />}</Await>
        </Suspense>
      ) : (
        <FeedWheelSkeleton />
      )}
    </section>
  );
}
