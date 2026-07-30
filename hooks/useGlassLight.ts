'use client';

import { useEffect } from 'react';

/**
 * The scene light (v2 §4.1–§4.4). One document-level, rAF-throttled
 * `pointermove` listener drives two things off a single event:
 *
 *  1. **Per-element diffuse hotspot** (v1, unchanged): the hovered
 *     `[data-glass-light]` element gets `--glass-px/--glass-py` (percent coords)
 *     so `.glass-interactive`'s `::after` can draw the light where the cursor is.
 *  2. **Global scene light** (v2): the pointer's viewport position, quantised
 *     to 8px, is written as `--light-x/--light-y` on `<html>` for the liquid
 *     renderer. CSS glass rims intentionally keep an element-anchored top sun:
 *     fixed background paint across many panes can trail during scroll/rubber-band.
 *
 * Cost: two `<html>`-level custom-property writes feed the single renderer.
 * 8px quantisation + rAF batching keep updates bounded.
 *
 * ## Why the hovered element's rect is cached
 *
 * This callback runs inside a rAF, *after* other rAF callbacks have already
 * written styles for the frame — the pointer metaball's loop writes four
 * transforms and a custom property immediately before it. A
 * `getBoundingClientRect()` there is a **forced synchronous layout** of the whole
 * document, every frame the pointer moves, and it scales with the page: on a
 * 60-card harness at 1920×1080 it took the per-pointer-frame cost from ~0.63ms to
 * ~1.35ms (p95 1.2ms → 3.0ms), and a real feed route is far bigger than that.
 *
 * The rect only changes when the element does, when the page scrolls, or when
 * the viewport resizes, so it is read once per element and invalidated on those.
 * A layout shift from something else (an image landing, a feed item streaming in)
 * can leave it stale for a moment; what that costs is a decorative highlight
 * sitting a few px off until the next scroll, which is the right trade for
 * dropping a full layout out of the pointer path.
 *
 * Gates: fine pointer only (touch keeps the CSS sun), off under `perf-lite`, and
 * static under reduced motion (OS preference OR the `html.reduce-motion` account
 * toggle) — the global light stops tracking and the sun default stands; the
 * per-element hotspot (a hover affordance, not motion) is unchanged. This effect
 * used to own `initGlassLens()` (§3.3) as well; the displacement lens is parked
 * (see the note in the effect body and in app/globals.css), so it does not.
 * Mounted once in `components/Providers.tsx`.
 */
export function useGlassLight(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // The per-element displacement lens is PARKED (see the §3.3–§3.6 note in
    // app/globals.css): no CSS rule consumes `--glass-lens` right now, because
    // current Chromium paints the displacement map into the bevel instead of
    // bending the backdrop through it. Minting per-element filters nobody reads
    // would be pure DOM churn, so the generator stays imported but uncalled —
    // restore `initGlassLens()` here when the CSS upgrades come back.
    const disposeLens = () => {};

    const root = document.documentElement;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!finePointer || root.classList.contains('perf-lite')) {
      return () => disposeLens();
    }

    // Reduced motion freezes the global light at the sun default; the per-element
    // hotspot still tracks (it is a hover highlight, not ambient motion).
    const reducedMotion =
      root.classList.contains('reduce-motion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const Q = 8; // px quantum — caps global-light style invalidations to ~1/8th
    let raf = 0;
    let last: HTMLElement | null = null;
    let lastLx = -1;
    let lastLy = -1;
    /** The event target `closest()` last ran on — re-entering it skips the walk. */
    let probed: Element | null = null;
    /** `last`'s cached box. Null = must be re-read. See the note above. */
    let rect: DOMRect | null = null;

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--glass-px');
      el.style.removeProperty('--glass-py');
    };

    const clearLight = () => {
      root.style.removeProperty('--light-x');
      root.style.removeProperty('--light-y');
      lastLx = -1;
      lastLy = -1;
    };

    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const target = (e.target as Element | null) ?? null;
        // `closest()` walks the whole ancestor chain; re-entering the element it
        // was last run on cannot produce a different answer.
        if (target !== probed) {
          probed = target;
          const el = target?.closest<HTMLElement>('[data-glass-light]') ?? null;
          if (el !== last) {
            clear(last);
            last = el;
            rect = null;
          }
        }
        const el = last;
        if (el) {
          if (!rect) rect = el.getBoundingClientRect();
          const r = rect;
          if (r.width > 0 && r.height > 0) {
            el.style.setProperty('--glass-px', `${((e.clientX - r.left) / r.width) * 100}%`);
            el.style.setProperty('--glass-py', `${((e.clientY - r.top) / r.height) * 100}%`);
          }
        }

        if (!reducedMotion) {
          const lx = Math.round(e.clientX / Q) * Q;
          const ly = Math.round(e.clientY / Q) * Q;
          if (lx !== lastLx || ly !== lastLy) {
            root.style.setProperty('--light-x', `${lx}px`);
            root.style.setProperty('--light-y', `${ly}px`);
            lastLx = lx;
            lastLy = ly;
          }
        }
      });
    };

    // Pointer left the document → rest the light at the sun default.
    const onLeave = () => clearLight();

    /** Anything that can move the hovered element under the pointer. Capture, so
     *  a scroll inside a rail or a modal invalidates it too, not just the page. */
    const invalidateRect = () => {
      rect = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', invalidateRect, { passive: true, capture: true });
    window.addEventListener('resize', invalidateRect, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', invalidateRect, { capture: true });
      window.removeEventListener('resize', invalidateRect);
      if (raf) cancelAnimationFrame(raf);
      clear(last);
      clearLight();
      disposeLens();
    };
  }, []);
}
