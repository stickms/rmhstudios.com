'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface RadialWheelItem {
  id: string;
  node: ReactNode;
}

interface RadialWheelProps {
  items: RadialWheelItem[];
  /** Called when the sentinel nears the viewport — drives lazy loading. */
  onEndReached?: () => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
  /** Short haptic tick each time a new card crosses the focus line. */
  haptics?: boolean;
  /** A leading node (e.g. the compose box) above the feed. */
  lead?: ReactNode;
}

/**
 * A native document-scrolling feed. Keep cards in normal flow: scroll-linked
 * transforms lag Firefox's asynchronous scrolling and re-rasterise card text.
 * Observers handle pagination and optional haptics without a scroll listener.
 */
export function RadialWheel({
  items,
  onEndReached,
  ariaLabel,
  className,
  children,
  haptics = false,
  lead,
}: RadialWheelProps) {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Preserve the focused card across pagination observer rebuilds.
  const focusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!haptics || reduced || typeof IntersectionObserver === 'undefined') return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const track = trackRef.current;
    if (!track) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          // Which card holds the focus line, by identity rather than by index:
          // lazy loading appends to the list, so an index means a different card
          // from one page to the next. This is also what absorbs the callback
          // every fresh observer opens with — it re-reports the card already at
          // the centre, which is a re-observation and not a crossing.
          if (e.target === focusRef.current) continue;
          const first = focusRef.current === null;
          focusRef.current = e.target;
          // Never on the first one. Arriving at a feed is not a crossing, and a
          // phone that buzzes as the page settles reads as a notification.
          if (!first) navigator.vibrate(4);
        }
      },
      // -50%/-50% collapses the root to a line across the middle of the
      // viewport: the only slot intersecting it is the one at the focus point.
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    for (const el of track.querySelectorAll<HTMLElement>('.radial-wheel__slot')) io.observe(el);
    return () => io.disconnect();
  }, [haptics, reduced, items.length]);

  // Lazy-load: fire when the sentinel nears the viewport (with headroom).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onEndReached) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onEndReached();
      },
      { root: null, rootMargin: '800px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [onEndReached]);

  return (
    <div className={cn('radial-wheel', className)} aria-label={ariaLabel} role="feed">
      {lead != null && <div className="radial-wheel__lead">{lead}</div>}
      <div ref={trackRef} className="radial-wheel__track">
        {items.map((item) => (
          <div key={item.id} className="radial-wheel__slot" role="article">
            {item.node}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="radial-wheel__sentinel" aria-hidden />
      {children}
    </div>
  );
}
