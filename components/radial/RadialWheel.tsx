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
  /** A leading, non-raked node (e.g. the compose box) pinned above the wheel. */
  lead?: ReactNode;
}

const MAX_TILT = 15; // deg of rake at the edges of the focus band
const EDGE_SCALE = 0.12;
const EDGE_Z = 64; // px pushed back at the edges
const FADE_START = 0.62; // |t| where cards begin to dim
const VISIBLE = 2.2; // |t| beyond which a card is off the focus band (flat, no layer)
/**
 * Floor on a raked card's opacity. The fade used to bottom out around 0.18,
 * which is not "de-emphasised", it is unreadable — and any capture taken while
 * a card sat there (a programmatic scroll, a print) kept it as a ghost.
 */
const MIN_OPACITY = 0.4;

/**
 * The feed as a gently curved column on the **document's own scroll** — no inner
 * scroll container. That is what lets mobile Safari collapse its address/tab bars
 * as you scroll (an inner `overflow:auto` region keeps them pinned and leaves the
 * fixed backdrop showing behind the bottom bar). Cards flow at their natural
 * heights (tall and short RMHarks never overlap), the browser owns the momentum /
 * rubber-band, and a rAF-throttled window-scroll pass rakes each card onto a
 * shallow cylinder by its distance from the viewport centre using cached document
 * offsets (no per-frame layout reads → no thrash). Under reduced-motion the curve
 * is dropped and it is a plain list.
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
  const slotsRef = useRef<HTMLElement[]>([]);
  const centersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const focusRef = useRef(-1);

  // Cache each card's document-absolute centre. Transforms shift getBoundingClientRect,
  // so clear them first, measure the true layout position, then the scroll pass
  // reapplies. Rebuilt when the set or any height changes.
  const buildCache = useCallback(() => {
    const track = trackRef.current;
    if (typeof window === 'undefined' || !track) return;
    const els = Array.from(track.querySelectorAll<HTMLElement>('.radial-wheel__slot'));
    slotsRef.current = els;
    for (const el of els) el.style.transform = '';
    const scrollY = window.scrollY;
    centersRef.current = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + scrollY + r.height / 2;
    });
  }, []);

  const apply = useCallback(() => {
    if (typeof window === 'undefined') return;
    const half = window.innerHeight / 2;
    if (half <= 0) return;
    const viewCenter = window.scrollY + half;
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
      const op = Math.max(
        MIN_OPACITY,
        1 - Math.min(1, Math.max(0, at - FADE_START) / (VISIBLE - FADE_START)) * 0.82,
      );
      // Per-card perspective() (rather than perspective on a container) keeps the
      // projection self-contained across browsers.
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

  // Drive the rake off the document scroll + viewport resize.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      buildCache();
      apply();
    };
    // Printing renders the page as it stands, so whatever rake was last applied
    // is baked into the output — cards frozen mid-transform, tilted and faded.
    // Flatten everything before the print snapshot and restore after.
    const flatten = () => {
      for (const el of slotsRef.current) {
        el.style.transform = '';
        el.style.opacity = '1';
        el.style.willChange = 'auto';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeprint', flatten);
    window.addEventListener('afterprint', apply);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeprint', flatten);
      window.removeEventListener('afterprint', apply);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [onScroll, buildCache, apply]);

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
