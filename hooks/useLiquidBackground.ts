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
 *  - **Touch (coarse pointer):** `deviceorientation` → device tilt. On Android /
 *    non-iOS the event fires with no prompt, so we auto-enable. iOS 13+ gates it
 *    behind an explicit `requestPermission()` user gesture; we never prompt on
 *    load — the Settings → Appearance "Tilt effects" row does the gesture-grant and
 *    persists consent as `rmh-motion-ok`, then fires `rmh:tilt-consent` so this hook
 *    starts (or stops) listening live.
 *
 * §5.5x C — tilt light: the same tilt that drifts the aurora also writes the scene
 * light `--light-x/--light-y` (viewport px: centre + tilt × ~40% of the viewport,
 * 8px-quantised, rAF-batched — the SAME contract useGlassLight uses on fine pointers
 * §4.4) and toggles `html.tilt-live`. Under `html.tilt-live` the coarse-pointer glint
 * layer flips from the static sun to the viewport-anchored radial (globals.css §4.35
 * touch block), so tilting the phone slides the glint across every pane. Light +
 * backdrop move together, which is what sells the material (§5.5x C.4).
 *
 * No React re-renders (writes straight to the DOM), and fully gated off under
 * reduced motion (OS preference or the `html.reduce-motion` account toggle) and
 * on low-end devices (`html.perf-lite`) — the same gates as the aurora parallax, so
 * tilt light never runs where those degradations apply. Mounted once in
 * `components/Providers.tsx`.
 */

/** Peak parallax travel in px on each axis — kept small so the aurora breathes, not lurches. */
const MAX_SHIFT = 24;
/** Tilt→light spread: peak specular travel from centre as a fraction of each
 *  viewport axis. ~40% keeps the glint on-pane at a comfortable hand tilt (§5.5x C.1). */
const TILT_LIGHT_SPREAD = 0.4;
/** px quantum for the light vars — matches useGlassLight's 8px grid so both light
 *  paths write the same steps and bound style invalidations to ~1/8th (§4.4 budget). */
const LIGHT_Q = 8;
/** localStorage consent flag for the iOS motion-permission gate (§5.5x C.3). */
const MOTION_OK_KEY = 'rmh-motion-ok';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function useLiquidBackground(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    // iOS/WebKit uses the static CSS aurora. Moving a fixed, oversized gradient
    // underneath multiple translucent surfaces can wedge WebKit's compositor;
    // keeping this hook detached preserves ordinary component animations.
    if (root.classList.contains('ios-webkit')) return;
    if (root.classList.contains('perf-lite')) return;
    if (root.classList.contains('reduce-motion')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    // Pending tilt-light coords (viewport px, quantised) written in the rAF batch;
    // haveLight stays false on the fine-pointer path (useGlassLight owns light there).
    let pendingLx = 0;
    let pendingLy = 0;
    let haveLight = false;
    let lastLx = -1;
    let lastLy = -1;
    let tiltLive = false;

    const apply = () => {
      raf = 0;
      root.style.setProperty('--aurora-mx', `${targetX.toFixed(2)}px`);
      root.style.setProperty('--aurora-my', `${targetY.toFixed(2)}px`);
      if (haveLight && (pendingLx !== lastLx || pendingLy !== lastLy)) {
        root.style.setProperty('--light-x', `${pendingLx}px`);
        root.style.setProperty('--light-y', `${pendingLy}px`);
        lastLx = pendingLx;
        lastLy = pendingLy;
      }
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
      // Aurora backdrop parallax (tilt is NOT inverted — the scene leans with the
      // device so light + backdrop travel together, §5.5x C.4).
      targetX = nx * MAX_SHIFT;
      targetY = ny * MAX_SHIFT;
      // Scene light (§5.5x C): centre + tilt × ~40% of the viewport, 8px-quantised.
      pendingLx =
        Math.round((window.innerWidth / 2 + nx * TILT_LIGHT_SPREAD * window.innerWidth) / LIGHT_Q) *
        LIGHT_Q;
      pendingLy =
        Math.round(
          (window.innerHeight / 2 + ny * TILT_LIGHT_SPREAD * window.innerHeight) / LIGHT_Q,
        ) * LIGHT_Q;
      haveLight = true;
      // Flip the coarse-pointer glint from static sun to the tracking radial while
      // orientation events flow (globals.css §4.35 touch block keys off .tilt-live).
      if (!tiltLive) {
        root.classList.add('tilt-live');
        tiltLive = true;
      }
      schedule();
    };

    const cleanups: Array<() => void> = [];

    // Attach/detach the orientation listener idempotently: iOS grants arrive later
    // (via the Settings row's rmh:tilt-consent event) and a revoke must stop tilt.
    let orientationAttached = false;
    const attachOrientation = () => {
      if (orientationAttached) return;
      orientationAttached = true;
      window.addEventListener('deviceorientation', onOrientation, { passive: true });
    };
    const detachOrientation = () => {
      if (!orientationAttached) return;
      orientationAttached = false;
      window.removeEventListener('deviceorientation', onOrientation);
      haveLight = false;
      lastLx = -1;
      lastLy = -1;
      if (tiltLive) {
        root.classList.remove('tilt-live');
        tiltLive = false;
      }
      // Rest the light at the CSS "sun" default (§4.2 var() fallbacks).
      root.style.removeProperty('--light-x');
      root.style.removeProperty('--light-y');
    };

    if (finePointer) {
      document.addEventListener('pointermove', onPointerMove, { passive: true });
      cleanups.push(() => document.removeEventListener('pointermove', onPointerMove));
    } else if ('DeviceOrientationEvent' in window) {
      const needsPermission =
        typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === 'function';
      if (!needsPermission) {
        // Android / non-iOS: the event fires with no prompt — auto-enable tilt
        // (§5.5x C.3 "auto-enable on no-permission platforms").
        attachOrientation();
      } else {
        // iOS: never prompt on load. Attach only if the user already consented via
        // the Settings row (the origin grant persists across loads).
        let consented = false;
        try {
          consented = localStorage.getItem(MOTION_OK_KEY) === '1';
        } catch {
          consented = false;
        }
        if (consented) attachOrientation();
      }
      // Live enable/disable from the Settings → Appearance "Tilt effects" row.
      const onConsent = (e: Event) => {
        if ((e as CustomEvent<boolean>).detail === false) detachOrientation();
        else attachOrientation();
      };
      window.addEventListener('rmh:tilt-consent', onConsent);
      cleanups.push(() => window.removeEventListener('rmh:tilt-consent', onConsent));
      cleanups.push(detachOrientation);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
      root.style.removeProperty('--aurora-mx');
      root.style.removeProperty('--aurora-my');
    };
  }, []);
}
