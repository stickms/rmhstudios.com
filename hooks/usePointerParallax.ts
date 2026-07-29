'use client';

/**
 * usePointerParallax — Apple's "the surface has depth" response.
 *
 * tvOS focus, visionOS windows and the iOS lock-screen wallpaper all share one
 * idea: a surface is built from layers at different depths, and when the user's
 * point of view moves, the layers move by different amounts. That difference is
 * the entire illusion — a single layer sliding is just movement; layers sliding
 * at different rates read as depth.
 *
 * This hook supplies the point of view from whatever the device offers:
 *   - a mouse/trackpad pointer over the element, or
 *   - device orientation (a phone tilt), which is what Apple actually uses on
 *     touch hardware, where there is no pointer to track.
 *
 * It returns spring-smoothed MotionValues rather than raw numbers, so:
 *   - motion carries momentum and settles instead of tracking input rigidly,
 *   - nothing re-renders React per frame (values feed the compositor directly),
 *   - the layers keep moving briefly after the pointer stops, which is the part
 *     that reads as physical.
 *
 * `depth` is the layer's distance from the viewer: 0 is glued to the surface,
 * 1 is the furthest back and moves most. Compose two or three depths in one
 * card to get real parallax rather than a single sliding plane.
 */
import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface PointerParallaxOptions {
  /** Max travel in px at depth 1. */
  strength?: number;
  /** Max rotation in degrees at depth 1. 0 disables the tilt. */
  tilt?: number;
  /** Spring softness; lower = floatier. */
  stiffness?: number;
}

export interface PointerParallaxLayer {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
}

export function usePointerParallax({
  strength = 18,
  tilt = 6,
  stiffness = 140,
}: PointerParallaxOptions = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  // Normalised pointer offset from the element's centre, −1…1 on both axes.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  // Springs give the layers weight: they overshoot slightly and settle, instead
  // of being welded to the cursor.
  const sx = useSpring(px, { stiffness, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness, damping: 20, mass: 0.6 });

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    const onPointerMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      px.set(((e.clientX - r.left) / r.width) * 2 - 1);
      py.set(((e.clientY - r.top) / r.height) * 2 - 1);
    };
    // Returning to centre on leave is what makes the surface feel like it
    // settles back to rest rather than freezing wherever the pointer left it.
    const onPointerLeave = () => {
      px.set(0);
      py.set(0);
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);

    // Touch hardware has no pointer to follow, so read the device's own tilt —
    // the same input Apple parallaxes wallpapers from. Only wired up when the
    // platform grants it without a permission prompt (Android, older iOS);
    // iOS 13+ requires a user gesture to request access, and interrupting a
    // page load with a permission sheet for a decorative effect is not a trade
    // worth making, so it simply stays off there.
    const orientationSupported =
      typeof window !== 'undefined' &&
      'DeviceOrientationEvent' in window &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- iOS-only permission API
      typeof (window.DeviceOrientationEvent as any)?.requestPermission !== 'function';

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      // gamma: left/right tilt (−90…90), beta: front/back (−180…180). Clamp to a
      // comfortable wrist range so a small tilt gives the full effect.
      px.set(Math.max(-1, Math.min(1, e.gamma / 35)));
      py.set(Math.max(-1, Math.min(1, (e.beta - 45) / 35)));
    };
    if (orientationSupported) window.addEventListener('deviceorientation', onOrientation);

    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerleave', onPointerLeave);
      if (orientationSupported) window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [px, py, reduced]);

  // Three fixed depths rather than a `layer(depth)` factory: each layer is built
  // from useTransform, and hooks cannot be created on demand inside a callback
  // without breaking the Rules of Hooks. Three planes is also as many as the
  // effect can actually express — beyond that the differences stop reading.
  //
  // Layers translate AGAINST the pointer, the far ones most, which is what
  // separates them in depth.
  const mk = (depth: number): PointerParallaxLayer => ({
    // eslint-disable-next-line react-hooks/rules-of-hooks -- called unconditionally, in a fixed order, exactly three times below
    x: useTransform(sx, (v) => (reduced ? 0 : -v * strength * depth)),
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see above
    y: useTransform(sy, (v) => (reduced ? 0 : -v * strength * depth)),
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see above
    rotateY: useTransform(sx, (v) => (reduced ? 0 : v * tilt * depth)),
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see above
    rotateX: useTransform(sy, (v) => (reduced ? 0 : -v * tilt * depth)),
  });

  const near = mk(0.35);
  const mid = mk(0.7);
  const far = mk(1);

  return { ref, near, mid, far, pointerX: sx, pointerY: sy };
}
