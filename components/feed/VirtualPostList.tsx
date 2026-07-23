'use client';

import { useEffect, useLayoutEffect, useRef, useState, memo } from'react';
import { useWindowVirtualizer } from'@tanstack/react-virtual';
import type { FeedItem } from'@/lib/feed-types';
import { RMHarkCard } from'./RMHarkCard';
import { useStableListMotion } from'@/hooks/useStableListMotion';

// useLayoutEffect warns during SSR; use useEffect on the server so the render
// stays quiet, and keep pre-paint timing on the client (scrollMargin must be
// right before the virtualized rows paint). Mirrors FeedList.
const useIsoLayoutEffect = typeof window !=='undefined'? useLayoutEffect : useEffect;

// Estimate before a row is measured. Matches `contain-intrinsic-size`on
// `.feed-card-cv`(globals.css), incl. the floating-card top gutter (§8.3).
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
 * `items.map(<RMHarkCard/>)`unvirtualized and unmemoized.
 *
 * Like FeedList it virtualizes against WINDOW scroll (the _site shell scrolls the
 * document), tracks its offset from the top of the page as `scrollMargin`, and
 * only mounts the rows in view (+ overscan). Cards are floating glass slabs now
 * (§8.3), so the list floats them over aurora gutters (space-y-3 gaps + px-3 side
 * gutters + pt-3 first-card gap) exactly like the home feed. The caller keeps its
 * headers, empty states, infinite-scroll sentinel, and"load more"controls.
 */
export function VirtualPostList({ items, className }: VirtualPostListProps) {
 const parentRef = useRef<HTMLDivElement>(null);
 const [scrollMargin, setScrollMargin] = useState(0);
 const enteringIds = useStableListMotion(
 items.map((item) => item.id),
 { maxAnimated: 8 },
 );

 // Server render + first client (hydration) render → a plain list so the SSR
 // HTML has content and hydration matches; `feed-card-cv`skips layout/paint for
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
 if (!el || typeof window ==='undefined') return;
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

 const virtualRows = virtualizer.getVirtualItems();
 const windowed = virtualized && virtualRows.length > 0;
 const rows = windowed
 ? virtualRows.map((row) => ({ index: row.index, key: row.key, start: row.start }))
 : items.map((item, index) => ({ index, key: item.id, start: 0 }));

 // The row/card structure stays the same across the SSR plain-list → windowed
 // transition. React therefore preserves visible cards instead of remounting
 // them and restarting image, media, or entrance animations after hydration.
 return (
 <div
 ref={parentRef}
 className={`${windowed ? 'relative ' : ''}w-full ${className ?? ''}`.trim()}
 style={windowed ? { height: `${virtualizer.getTotalSize()}px`} : undefined}
 >
 {rows.map((row) => {
 const item = items[row.index];
 if (!item) return null;
 const entering = enteringIds.has(item.id);
 return (
 <div
 key={row.key}
 data-index={row.index}
 ref={windowed ? virtualizer.measureElement : undefined}
 style={
 windowed
 ? {
 position:'absolute',
 top: 0,
 left: 0,
 width:'100%',
 transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
 }
 : undefined
 }
 >
 <div
 className={`px-3 pt-3 ${!windowed && !entering ?'feed-card-cv':''} ${entering ?'content-item-enter':''}`.trim()}
 >
 <MemoRMHarkCard item={item} />
 </div>
 </div>
 );
 })}
 </div>
 );
}
