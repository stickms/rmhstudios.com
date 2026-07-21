'use client';

import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { FeedItem } from '@/lib/feed-types';
import { RMHarkCard } from './RMHarkCard';

// useLayoutEffect warns during SSR; use useEffect on the server so the render
// stays quiet, and keep pre-paint timing on the client (scrollMargin must be
// right before the virtualized rows paint). Mirrors FeedList.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Estimate before a row is measured. Matches `contain-intrinsic-size` on
// `.feed-card-cv` (globals.css), incl. the floating-card top gutter (§8.3).
const ESTIMATED_ROW_HEIGHT = 332;
const OVERSCAN = 6;

/**
 * A RMHark row memoized on its `item`, so a parent re-render for unrelated
 * reasons (search input, tab flip, live count tick elsewhere) doesn't re-render
 * every card. RMHarkCard's own store/session subscriptions still update it when
 * its data actually changes. Exported for the (small, deeply-nested) lists that
 * keep a plain map instead of full windowing.
 */
export const MemoRMHarkCard = memo(function MemoRMHarkCard({ item }: { item: FeedItem }) {
  return <RMHarkCard item={item} />;
});

interface VirtualPostListProps {
  items: FeedItem[];
  /** Applied to the list container (both the plain and windowed variants). */
  className?: string;
}

/**
 * Windowed list of RMHark cards — the home feed's windowing (FeedList) extracted
 * for the profile/tag/community/bookmarks columns, which previously rendered
 * `items.map(<RMHarkCard/>)` unvirtualized and unmemoized.
 *
 * Like FeedList it virtualizes against WINDOW scroll (the _site shell scrolls the
 * document), tracks its offset from the top of the page as `scrollMargin`, and
 * only mounts the rows in view (+ overscan). Cards are floating glass slabs now
 * (§8.3), so the list floats them over aurora gutters (space-y-3 gaps + px-3 side
 * gutters + pt-3 first-card gap) exactly like the home feed. The caller keeps its
 * headers, empty states, infinite-scroll sentinel, and "load more" controls.
 */
export function VirtualPostList({ items, className }: VirtualPostListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Server render + first client (hydration) render → a plain list so the SSR
  // HTML has content and hydration matches; `feed-card-cv` skips layout/paint for
  // offscreen cards until the virtualizer takes over on mount.
  const [virtualized, setVirtualized] = useState(false);
  useEffect(() => {
    setVirtualized(true);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    // Stable per-post key so measured heights survive prepends/reorders.
    getItemKey: (index) => items[index]?.id ?? index,
    scrollMargin,
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
    // Content above the list (profile header, tabs, composer) can resize and
    // shift where the list starts — observe the document so scrollMargin follows.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [virtualized]);

  if (!virtualized) {
    return (
      <div ref={parentRef} className={`space-y-3 px-3 pt-3 ${className ?? ''}`.trim()}>
        {items.map((item) => (
          <div key={item.id} className="feed-card-cv">
            <MemoRMHarkCard item={item} />
          </div>
        ))}
      </div>
    );
  }

  // Windowed: the container reserves the full (measured) height so the scrollbar
  // and any following infinite-scroll sentinel behave. No `feed-card-cv` here —
  // the virtualizer already culls offscreen rows, and content-visibility would
  // report the intrinsic-size estimate for overscan rows, corrupting measurement.
  return (
    <div
      ref={parentRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((vRow) => {
        const item = items[vRow.index];
        if (!item) return null;
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
            {/* Gutter + top gap ride the inner element so measureElement includes
                it (keeps virtual offsets exact), mirroring FeedList (§8.3). */}
            <div className="px-3 pt-3">
              <MemoRMHarkCard item={item} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
