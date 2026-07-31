'use client';

/**
 * useDeviceTilt — gyroscope input for surfaces that would otherwise only
 * respond to a pointer.
 *
 * Hover is a desktop luxury: on a phone every pointer-driven depth effect is
 * inert, so a page built around one flattens out on the device most people
 * actually browse from. This hook hands that page the handset's own attitude
 * instead — a smoothed −1…1 vector, delivered on an animation frame, which the
 * caller can write straight into CSS custom properties without re-rendering.
 *
 * What it guarantees so callers don't have to think about it:
 *  - **It never prompts on load.** iOS gates `deviceorientation` behind a user
 *    gesture; {@link DeviceTilt.toggle} is that gesture. Consent is the shared
 *    site-wide `rmh-motion-ok` (Settings → Appearance "Tilt effects"), so a
 *    grant made anywhere counts everywhere, and revoking it there stops this.
 *  - **It only claims support where tilt is the right input** — a touch device
 *    with the event available, with reduced motion honoured (§7: the effect is
 *    decorative, so it simply does not exist for anyone who asked for less
 *    motion) and a watchdog that stands down when no usable sample arrives.
 *  - **It costs one rAF while moving and nothing at rest.** Values are
 *    spring-smoothed toward the live reading and the loop stops once it settles.
 *
 * The permission/consent plumbing and the angle maths live in
 * `lib/device-tilt.ts`; this file is the React lifecycle around them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MOTION_CONSENT_EVENT,
  driftNeutral,
  motionPermissionGateExists,
  readMotionConsent,
  requestMotionAccess,
  screenAngle,
  tiltCapableDevice,
  tiltVector,
  writeMotionConsent,
  type TiltSample,
  type TiltVector,
} from '@/lib/device-tilt';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type DeviceTiltStatus =
  /** No sensor worth using here — render no control at all. */
  | 'unsupported'
  /** Available, but the visitor has it switched off. */
  | 'off'
  /** Listening; nothing usable has arrived yet. */
  | 'waiting'
  /** Live samples are flowing. */
  | 'active'
  /** The permission prompt was declined (or blocked). */
  | 'denied';

export interface DeviceTiltOptions {
  /** Called on an animation frame with the smoothed deflection, −1…1 per axis. */
  onTilt: (tilt: TiltVector) => void;
  /** Called when tilt stops driving the surface, so the caller can reset to rest. */
  onRest?: () => void;
  /** Degrees of tilt that count as full deflection. A wrist's worth by default. */
  range?: number;
  /** Fraction of the remaining distance covered per frame; lower = floatier. */
  smoothing?: number;
  /** How fast the neutral pose follows the live one, per sample (see `driftNeutral`). */
  drift?: number;
}

export interface DeviceTilt {
  /** Whether to offer the control at all. */
  supported: boolean;
  /** Whether tilt is currently switched on (persisted site-wide). */
  enabled: boolean;
  status: DeviceTiltStatus;
  /** Flip it, prompting for motion access if the platform gates it. */
  toggle: () => Promise<DeviceTiltStatus>;
  /** Treat the current pose as level again. */
  recenter: () => void;
}

/** How long to wait for a usable sample before deciding there is no sensor. */
const WATCHDOG_MS = 2500;
/** Below this the spring has arrived; the frame loop stops until the next sample. */
const SETTLED = 0.0008;

export function useDeviceTilt({
  onTilt,
  onRest,
  range = 22,
  smoothing = 0.16,
  drift = 0.006,
}: DeviceTiltOptions): DeviceTilt {
  const reducedMotion = useReducedMotion();
  // Both resolve on the client only: the server has no sensor and no
  // localStorage, and a first render that disagreed would hydrate-mismatch.
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<DeviceTiltStatus>('unsupported');

  // Handlers live in refs so a caller passing inline closures (the normal case)
  // doesn't tear down and re-arm the sensor on every render.
  const onTiltRef = useRef(onTilt);
  const onRestRef = useRef(onRest);
  onTiltRef.current = onTilt;
  onRestRef.current = onRest;

  const recenterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setSupported(false);
      return;
    }
    setSupported(tiltCapableDevice());
  }, [reducedMotion]);

  useEffect(() => {
    const consent = readMotionConsent();
    // Where the platform gates the sensor there must be an explicit grant.
    // Everywhere else the event fires freely, so tilt is on unless it was
    // deliberately switched off — matching the site's aurora tilt (§5.5x C.3).
    setEnabled(motionPermissionGateExists() ? consent === true : consent !== false);

    // The Settings → Appearance row writes the same consent; mirror it live.
    const onConsent = (event: Event) =>
      setEnabled((event as CustomEvent<boolean>).detail !== false);
    window.addEventListener(MOTION_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(MOTION_CONSENT_EVENT, onConsent);
  }, []);

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    if (!enabled) {
      setStatus((prev) => (prev === 'denied' ? prev : 'off'));
      onRestRef.current?.();
      return;
    }

    setStatus('waiting');

    // Neutral is learnt from the first usable sample, so however the visitor is
    // holding the phone when they arrive is "level".
    let neutral: TiltSample | null = null;
    let target: TiltVector = { x: 0, y: 0 };
    const current: TiltVector = { x: 0, y: 0 };
    let frame = 0;
    let live = false;

    const step = () => {
      frame = 0;
      current.x += (target.x - current.x) * smoothing;
      current.y += (target.y - current.y) * smoothing;
      const settled =
        Math.abs(target.x - current.x) < SETTLED && Math.abs(target.y - current.y) < SETTLED;
      if (settled) {
        current.x = target.x;
        current.y = target.y;
      }
      onTiltRef.current({ x: current.x, y: current.y });
      if (!settled) frame = requestAnimationFrame(step);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event;
      // A browser that fires the event with nulls has no sensor behind it —
      // leave the watchdog to stand the whole thing down.
      if (beta === null || gamma === null) return;

      const sample: TiltSample = { beta, gamma };
      if (!neutral) neutral = sample;
      else neutral = driftNeutral(neutral, sample, drift);

      target = tiltVector(sample, neutral, screenAngle(), range);
      if (!live) {
        live = true;
        setStatus('active');
      }
      schedule();
    };

    // Rotating the phone re-maps the axes; re-learn level rather than snapping
    // the whole shelf to whatever the swapped axes happen to read.
    const onScreenRotate = () => {
      neutral = null;
    };

    recenterRef.current = onScreenRotate;

    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    window.addEventListener('orientationchange', onScreenRotate, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', onScreenRotate);

    const watchdog = window.setTimeout(() => {
      if (!live) setSupported(false);
    }, WATCHDOG_MS);

    return () => {
      recenterRef.current = null;
      window.clearTimeout(watchdog);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', onScreenRotate);
      window.screen?.orientation?.removeEventListener?.('change', onScreenRotate);
      onRestRef.current?.();
    };
  }, [supported, enabled, range, smoothing, drift]);

  const toggle = useCallback(async (): Promise<DeviceTiltStatus> => {
    if (enabled) {
      writeMotionConsent(false);
      setEnabled(false);
      setStatus('off');
      return 'off';
    }
    // Called straight from the click handler so Safari still counts it as a
    // user gesture; anything awaited before this point would forfeit that.
    const granted = await requestMotionAccess();
    if (!granted) {
      setStatus('denied');
      return 'denied';
    }
    writeMotionConsent(true);
    setEnabled(true);
    setStatus('waiting');
    return 'waiting';
  }, [enabled]);

  const recenter = useCallback(() => recenterRef.current?.(), []);

  return useMemo(
    () => ({ supported, enabled, status, toggle, recenter }),
    [supported, enabled, status, toggle, recenter],
  );
}
