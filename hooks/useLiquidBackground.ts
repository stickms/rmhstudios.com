'use client';

import { useEffect } from 'react';

/**
 * Makes the aurora canvas reactive to movement — the second half of the site's
 * "liquid" backdrop (the first is the ambient `aurora-drift` keyframe in
 * globals.css). One rAF-throttled listener maps input motion to a small parallax
 * offset written as CSS custom properties (`--aurora-mx` / `--aurora-my`, in px)
 * on `<html>`; the `body::before` aurora layer reads them through its `translate`
 * longhand (which composes with the drift animation's `transform`), and a CSS
 * transition eases the follow so the backdrop trails the cursor like a fluid.
 *
 * Two input modes, chosen by device:
 *  - **Fine pointer (desktop):** `pointermove` → offset from the viewport centre.
 *  - **Touch (coarse pointer):** `deviceorientation` → device tilt, but only where
 *    it needs no permission prompt (Android / non-iOS). iOS 13+ gates the event
 *    behind an explicit `requestPermission()` user gesture; we never prompt on
 *    load, so iOS simply keeps the ambient drift without the tilt parallax.
 *
 * No React re-renders (writes straight to the DOM), and fully gated off under
 * reduced motion (OS preference or the `html.reduce-motion` account toggle) and
 * on low-end devices (`html.perf-lite`). Mounted once in `components/Providers.tsx`.
 */

/** Peak parallax travel in px on each axis — kept small so the aurora breathes, not lurches. */
const MAX_SHIFT = 24;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function useLiquidBackground(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    if (root.classList.contains('perf-lite')) return;
    if (root.classList.contains('reduce-motion')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;

    const apply = () => {
      raf = 0;
      root.style.setProperty('--aurora-mx', `${targetX.toFixed(2)}px`);
      root.style.setProperty('--aurora-my', `${targetY.toFixed(2)}px`);
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1 … 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      // Invert so the aurora drifts against the cursor (content-over-parallax feel).
      targetX = clamp(-nx, -1, 1) * MAX_SHIFT;
      targetY = clamp(-ny, -1, 1) * MAX_SHIFT;
      schedule();
    };

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      // gamma: left-right tilt (-90…90); beta: front-back (-180…180). Normalise a
      // comfortable hand-tilt range to the same -1…1 the pointer path produces.
      const nx = clamp(e.gamma / 45, -1, 1);
      const ny = clamp((e.beta - 45) / 45, -1, 1);
      targetX = nx * MAX_SHIFT;
      targetY = ny * MAX_SHIFT;
      schedule();
    };

    const cleanups: Array<() => void> = [];

    if (finePointer) {
      document.addEventListener('pointermove', onPointerMove, { passive: true });
      cleanups.push(() => document.removeEventListener('pointermove', onPointerMove));
    } else if ('DeviceOrientationEvent' in window) {
      // Only attach where the browser fires the event without an explicit
      // permission grant (i.e. iOS's requestPermission gate is absent).
      const needsPermission =
        typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === 'function';
      if (!needsPermission) {
        window.addEventListener('deviceorientation', onOrientation, { passive: true });
        cleanups.push(() => window.removeEventListener('deviceorientation', onOrientation));
      }
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
      root.style.removeProperty('--aurora-mx');
      root.style.removeProperty('--aurora-my');
    };
  }, []);
}
