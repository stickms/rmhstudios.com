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

/** First index whose value is >= `target`, in a sorted array. */
function lowerBound(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

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
  /** Per-slot raked/flat flag, so a style is written only when it changes. */
  const stateRef = useRef<Uint8Array>(new Uint8Array(0));
  /** The window of slots raked last pass — the only ones that can need resetting. */
  const bandRef = useRef({ lo: 0, hi: -1 });

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
    // The rake's bookkeeping describes the OLD element list, and the transforms
    // it was tracking have just been cleared above — so both are reset here or
    // the next pass would skip a write believing it had already made it.
    stateRef.current = new Uint8Array(els.length);
    bandRef.current = { lo: 0, hi: -1 };
  }, []);

  /**
   * Rake the cards in the focus band onto the cylinder.
   *
   * Two rules keep this affordable, and both were learned the expensive way.
   *
   * **Only touch cards in the band.** This used to walk every slot in the feed
   * on every scroll frame, which is a loop that grows as the feed lazy-loads
   * more pages — and the cards outside the band, which is nearly all of them,
   * still took three style writes each to be told they are still flat. The
   * centres are in document order, so the band is a contiguous window: find it,
   * rake it, and reset only the cards that have just left it (`bandLo/bandHi`
   * remember the last one).
   *
   * **Never write a style that is not changing.** An inline style assignment
   * invalidates the element's computed style whether or not the value differs,
   * and `will-change` is the worst of them — it creates and destroys a
   * compositor layer, and this wrote it on every card on every frame. It now
   * flips exactly twice per card per pass through the band, and the transform
   * and opacity strings are compared before they are assigned.
   */
  const apply = useCallback(() => {
    if (typeof window === 'undefined') return;
    const half = window.innerHeight / 2;
    if (half <= 0) return;
    const viewCenter = window.scrollY + half;
    const els = slotsRef.current;
    const centers = centersRef.current;
    const state = stateRef.current;

    /** Flatten a card that has left the band (or is leaving because of `reduced`). */
    const flatten = (i: number) => {
      if (!state[i]) return;
      state[i] = 0;
      const el = els[i];
      el.style.transform = '';
      el.style.opacity = '';
      el.style.willChange = 'auto';
    };

    // The band, as a window into the (document-ordered) centres. `reduced`
    // collapses it to nothing, which flattens everything and writes no more.
    const reach = VISIBLE * half;
    let lo = 0;
    let hi = -1;
    if (!reduced) {
      lo = lowerBound(centers, viewCenter - reach);
      hi = lowerBound(centers, viewCenter + reach) - 1;
    }

    // Anything that was raked and is no longer in the window goes flat. Only the
    // edges can have changed, so this is a handful of indices, not a sweep.
    for (let i = bandRef.current.lo; i <= bandRef.current.hi; i++) {
      if (i < lo || i > hi) flatten(i);
    }
    bandRef.current = { lo, hi };

    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = lo; i <= hi; i++) {
      const el = els[i];
      if (!el) continue;
      const dy = centers[i] - viewCenter;
      const ad = Math.abs(dy);
      if (ad < nearestDist) {
        nearestDist = ad;
        nearest = i;
      }
      const t = dy / half;
      const at = Math.abs(t);
      if (at > VISIBLE) {
        flatten(i);
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
      // `will-change` on entry only — a layer that is created and thrown away
      // every frame is worse than no layer at all.
      if (!state[i]) {
        state[i] = 1;
        el.style.willChange = 'transform';
      }
      // Per-card perspective() (rather than perspective on a container) keeps the
      // projection self-contained across browsers.
      const transform = `perspective(1500px) translateZ(${tz.toFixed(1)}px) rotateX(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      if (transform !== el.style.transform) el.style.transform = transform;
      const opacity = op.toFixed(3);
      if (opacity !== el.style.opacity) el.style.opacity = opacity;
    }

    // The nearest card drives the haptic tick. When the band is empty (reduced
    // motion, or a scroll position with nothing near the centre) there is no
    // focus to report, and `-1` is already the "none" value.
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
        el.style.opacity = '';
        el.style.willChange = 'auto';
      }
      // `apply` skips writes it believes it has already made, so the state it
      // skips against has to say "flat" after this or the restore is a no-op.
      stateRef.current.fill(0);
      bandRef.current = { lo: 0, hi: -1 };
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
