'use client';

import { useEffect } from 'react';

/**
 * Makes the aurora canvas reactive to movement — the second half of the site's
 * "liquid" backdrop (the first is the ambient `aurora-drift` keyframe in
 * globals.css). One rAF-throttled listener maps input motion to a small parallax
 * offset written as CSS custom properties (`--aurora-mx` / `--aurora-my`, in px)
 * on the `.site-aurora` host; its two layers read them through their `translate`
 * longhand (which composes with the drift animation's `transform`), and a CSS
 * transition eases the follow so the backdrop trails the cursor like a fluid.
 *
 * **One input mode: device tilt.** `deviceorientation` on coarse-pointer
 * hardware. On Android / non-iOS the event fires with no prompt, so we
 * auto-enable. iOS 13+ gates it behind an explicit `requestPermission()` user
 * gesture; we never prompt on load — the Settings → Appearance "Tilt effects" row
 * does the gesture-grant and persists consent as `rmh-motion-ok`, then fires
 * `rmh:tilt-consent` so this hook starts (or stops) listening live.
 *
 * There used to be a second mode: a `pointermove` listener on desktop that drifted
 * the aurora against the cursor. It is gone, with the rest of the site's cursor
 * reactivity (see the §5.1 note in `app/globals.css`). Cheap as the write itself
 * had become, the effect still woke a rAF, re-resolved two custom properties and
 * re-composited two viewport-sized gradient layers on every frame the mouse moved
 * — an unbroken stream of them during exactly the gestures (drag, scroll, hover
 * along a grid) that have a frame budget to defend. On a fine pointer this hook now
 * attaches **no listener at all**; the ambient `aurora-drift` keyframe, which is a
 * compositor animation with no main-thread cost, carries the backdrop alone.
 * Tilt survives because it is explicit — the visitor turned it on — and because it
 * is the one input a touch device has.
 *
 * Tilt also toggles `html.tilt-live`, a live-input signal for CSS. It used to
 * publish a scene light as well (centre + tilt × ~40% of the viewport); the only
 * consumer of that was the shader tier, which is deleted, so the light is gone
 * and the tilt moves the aurora alone.
 *
 * No React re-renders (writes straight to the DOM), and fully gated off under
 * reduced motion (OS preference or the `html.reduce-motion` account toggle) and
 * on low-end devices (`html.perf-lite`) — the same gates as the aurora parallax, so
 * tilt light never runs where those degradations apply. Mounted once in
 * `components/Providers.tsx`.
 *
 * ## Where these values are written, and why it is not `<html>` (load-bearing)
 *
 * A custom-property write dirties the computed style of every element BENEATH
 * the element written to, because custom properties inherit — and this site
 * declares ~250 tokens on `:root`, so each of those elements has that whole map
 * rebuilt. Measured on `/store` (407 elements) at 4× CPU throttle:
 *
 * | one custom-property write on… | forced style+layout flush |
 * | ----------------------------- | ------------------------- |
 * | `<html>`                      | **~70ms**                 |
 * | `<body>`                      | ~73ms                     |
 * | `<main>`                      | ~24ms                     |
 * | a leaf element                | ~0ms                      |
 *
 * (A class toggle on `<html>` costs ~2ms — class changes have invalidation sets;
 * custom properties do not.)
 *
 * This hook used to write four properties on `<html>` — `--light-x`, `--light-y`,
 * `--aurora-mx`, `--aurora-my` — unconditionally, at full pointer precision, on
 * every rAF the pointer moved. That is a whole-document restyle per frame for the
 * entire duration of any gesture, and it was the largest single cost on the site:
 * dragging the navigation globe measured **4.4fps** with **624ms** of input
 * latency, against 2.8ms of actual work inside the globe's own frame loop.
 *
 * Two things fixed it, and both must hold:
 *
 *  1. **The light does not go through CSS at all.** Nothing in the stylesheet
 *     ever read `--light-x/--light-y`; the shader tier read them back off the same
 *     inline style it wrote them to. That tier has since been deleted (it was
 *     never initialised), so there is no scene light left to publish — this hook
 *     writes the aurora offset and nothing else.
 *  2. **The aurora offset is written on the layer that reads it.** The two aurora
 *     layers are pseudo-elements of `.site-aurora` (`app/routes/__root.tsx`), a
 *     leaf whose only descendants are those two pseudos, so the write invalidates
 *     them and nothing else. They used to be `body::before`/`body::after`, which
 *     forced the property up onto `<html>` for them to inherit it.
 *
 * If a new value has to reach CSS from here, give it the element that reads it.
 * Do not put it on `<html>`.
 */

/** Peak parallax travel in px on each axis — kept small so the aurora breathes, not lurches. */
const MAX_SHIFT = 24;
/**
 * Where the parallax offset is written. Its two pseudo-elements ARE the aurora,
 * and they are the only things that read `--aurora-mx/--aurora-my` — see the
 * write-budget note above for why that matters. Rendered in `__root.tsx`.
 */
const AURORA_HOST = '.site-aurora';
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
    /**
     * The aurora host. Resolved once — it is rendered by `__root.tsx` and lives
     * for the life of the document. Null only if this hook somehow mounts before
     * the shell, in which case the aurora simply stays at its resting offset.
     */
    const aurora = document.querySelector<HTMLElement>(AURORA_HOST);
    // Last offset actually written, so a pointer that jitters inside a pixel
    // writes nothing. Seeded off-grid so the first frame always lands.
    let lastMx = Number.NaN;
    let lastMy = Number.NaN;
    let tiltLive = false;

    const apply = () => {
      raf = 0;
      // Full pointer precision: this write lands on a leaf with two pseudo
      // children, so it is free. (It was quantised and rate-limited while it
      // still had to go through `<html>` — see the write-budget note above.)
      const mx = +targetX.toFixed(2);
      const my = +targetY.toFixed(2);
      if (aurora && (mx !== lastMx || my !== lastMy)) {
        aurora.style.setProperty('--aurora-mx', `${mx}px`);
        aurora.style.setProperty('--aurora-my', `${my}px`);
        lastMx = mx;
        lastMy = my;
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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
      // Mark orientation input live. Coarse-pointer rims remain element-anchored
      // in CSS so their highlight cannot trail a scrolling or transitioning pane.
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
      if (tiltLive) {
        root.classList.remove('tilt-live');
        tiltLive = false;
      }
    };

    // Cursor input is deliberately NOT wired here any more (see the header note):
    // a fine-pointer machine gets the ambient `aurora-drift` keyframe and nothing
    // else, so no listener, no rAF and no style write happens while the mouse
    // moves. Tilt is the only live input, and only where the visitor asked for it.
    if (!finePointer && 'DeviceOrientationEvent' in window) {
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
      aurora?.style.removeProperty('--aurora-mx');
      aurora?.style.removeProperty('--aurora-my');
    };
  }, []);
}
