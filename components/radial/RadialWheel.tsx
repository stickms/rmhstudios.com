'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface RadialWheelItem {
  id: string;
  node: ReactNode;
}

interface RadialWheelProps {
  items: RadialWheelItem[];
  /** Called (rAF-debounced) when the scroll nears the end — drives lazy loading. */
  onEndReached?: () => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
  /** Short haptic tick each time a new card crosses the focus line. */
  haptics?: boolean;
}

const MAX_TILT = 15; // deg of rake at the edges of the focus band
const EDGE_SCALE = 0.12;
const EDGE_Z = 64; // px pushed back at the edges
const FADE_START = 0.62; // |t| where cards begin to dim
const VISIBLE = 2.2; // |t| beyond which a card is off the focus band (flat, no layer)

/**
 * The feed as a gently curved column on NATIVE scroll. Cards flow at their own
 * natural heights — so tall and short RMHarks never overlap — and the browser's
 * own momentum/rubber-band drives the scroll (the authentic Apple feel; no
 * hijacked physics to go wonky). A rAF-throttled scroll pass rakes each card
 * onto a shallow cylinder by its distance from the focus line using cached
 * offsets (no per-frame layout reads → no thrash), so it stays buttery at any
 * refresh rate. Under reduced-motion the curve is dropped and it is a plain list.
 */
export function RadialWheel({
  items,
  onEndReached,
  ariaLabel,
  className,
  children,
  haptics = false,
}: RadialWheelProps) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const slotsRef = useRef<HTMLElement[]>([]);
  const centersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const focusRef = useRef(-1);

  // Cache each card's centre (layout-stable; transforms don't affect offsetTop),
  // so the scroll pass is pure math. Rebuilt when the set or any height changes.
  const buildCache = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const els = Array.from(track.querySelectorAll<HTMLElement>('.radial-wheel__slot'));
    slotsRef.current = els;
    centersRef.current = els.map((el) => el.offsetTop + el.offsetHeight / 2);
  }, []);

  const apply = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const half = scroller.clientHeight / 2;
    if (half <= 0) return;
    const viewCenter = scroller.scrollTop + half;
    const els = slotsRef.current;
    const centers = centersRef.current;
    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const dy = centers[i] - viewCenter;
      const ad = Math.abs(dy);
      if (ad < nearestDist) {
        nearestDist = ad;
        nearest = i;
      }
      const t = dy / half;
      const at = Math.abs(t);
      if (reduced || at > VISIBLE) {
        el.style.transform = '';
        el.style.opacity = '1';
        el.style.willChange = 'auto';
        continue;
      }
      const rot = Math.max(-MAX_TILT, Math.min(MAX_TILT, -t * MAX_TILT));
      const clamped = Math.min(at, 1);
      const scale = 1 - clamped * EDGE_SCALE;
      const tz = -Math.min(at, 1.5) * EDGE_Z;
      const op = 1 - Math.min(1, Math.max(0, at - FADE_START) / (VISIBLE - FADE_START)) * 0.82;
      // Per-card perspective() (rather than perspective on the scroll container,
      // which is quirky across browsers) keeps the projection self-contained.
      el.style.transform = `perspective(1500px) translateZ(${tz.toFixed(1)}px) rotateX(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      el.style.opacity = op.toFixed(3);
      el.style.willChange = 'transform';
    }

    if (nearest !== focusRef.current) {
      const prev = focusRef.current;
      focusRef.current = nearest;
      if (
        haptics &&
        prev !== -1 &&
        !reduced &&
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(4);
      }
    }
  }, [reduced, haptics]);

  const onScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      apply();
    });
  }, [apply]);

  // Rebuild + repaint on mount, when the set changes, and on any content resize
  // (late images, reflow) so variable heights always stay correctly spaced.
  useEffect(() => {
    buildCache();
    apply();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      buildCache();
      apply();
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [buildCache, apply, items.length]);

  useEffect(() => {
    const onResize = () => {
      buildCache();
      apply();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [buildCache, apply]);

  // Lazy-load: fire when the sentinel enters the scroll viewport (with headroom).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !onEndReached) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onEndReached();
      },
      { root, rootMargin: '800px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [onEndReached]);

  return (
    <div
      ref={scrollRef}
      className={cn('radial-wheel', className)}
      onScroll={onScroll}
      aria-label={ariaLabel}
      role="feed"
    >
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
