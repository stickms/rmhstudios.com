'use client';

import { useEffect } from 'react';
import { initGlassLens } from '@/lib/glass-lens';

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
 * Gates: fine pointer only (touch keeps the CSS sun), off under `perf-lite`, and
 * static under reduced motion (OS preference OR the `html.reduce-motion` account
 * toggle) — the global light stops tracking and the sun default stands; the
 * per-element hotspot (a hover affordance, not motion) is unchanged. This effect
 * also owns `initGlassLens()` (§3.3): the lens generator is pointer-independent,
 * so it runs before the fine-pointer gate (touch devices still refract).
 * Mounted once in `components/Providers.tsx`.
 */
export function useGlassLight(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Lens refraction filters (Chromium-only; self-gates on support / perf-lite
    // / reduced-transparency). Pointer-independent — set up before the pointer
    // gate so touch devices still get refraction.
    const disposeLens = initGlassLens();

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
        const el = (e.target as Element | null)?.closest<HTMLElement>('[data-glass-light]') ?? null;
        if (last && last !== el) clear(last);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            el.style.setProperty('--glass-px', `${((e.clientX - r.left) / r.width) * 100}%`);
            el.style.setProperty('--glass-py', `${((e.clientY - r.top) / r.height) * 100}%`);
          }
        }
        last = el;

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

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      clear(last);
      clearLight();
      disposeLens();
    };
  }, []);
}
