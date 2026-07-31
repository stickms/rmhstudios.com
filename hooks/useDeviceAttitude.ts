'use client';

/**
 * useDeviceAttitude — "move the phone to look at the thing".
 *
 * Mount this next to something rendered in 3D and it hands over a smoothed
 * rotation, once per animation frame, that orbits the object as the viewer moves
 * around it: turn to your left and its right-hand side comes round to meet you,
 * raise the phone and you look down over the top. A full quarter turn to the
 * object's side — or further, round to its back — is expressive rather than a
 * clamped lean, and the object never rolls; see `lib/device-attitude.ts` for the
 * model and the maths.
 *
 * What it guarantees so callers don't have to think about it:
 *  - **It never prompts on load.** iOS gates `deviceorientation` behind a user
 *    gesture; {@link DeviceAttitude.toggle} is that gesture. Consent is the
 *    shared site-wide `rmh-motion-ok` (Settings → Appearance "Tilt effects"), so
 *    a grant made anywhere counts everywhere, and revoking it there stops this.
 *  - **It only claims support where moving the device is the point** — a touch
 *    device with the event live, never under reduced motion, and a watchdog that
 *    stands down when no usable sample arrives (plenty of browsers fire the
 *    event with null angles).
 *  - **It costs one rAF while moving and nothing at rest.** The loop stops the
 *    frame the smoothed rotation reaches the sensor's.
 *
 * Callers that also want a drag/keyboard path should compose it on top of the
 * quaternion this emits, so both inputs drive one object — a phone can only be
 * turned so far before its screen is out of sight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IDENTITY,
  MOTION_CONSENT_EVENT,
  angleBetween,
  deviceQuaternion,
  motionCapableDevice,
  motionPermissionGateExists,
  nlerp,
  orbitRotation,
  readMotionConsent,
  requestMotionAccess,
  screenAngle,
  writeMotionConsent,
  type Quat,
} from '@/lib/device-attitude';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type MotionStatus =
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

export interface DeviceAttitudeOptions {
  /** Called on an animation frame with the smoothed rotation for the object. */
  onRotate: (rotation: Quat) => void;
  /** Called when the sensor stops driving the object, so the caller can reset. */
  onRest?: () => void;
  /**
   * How far the object turns per degree of device rotation. Above 1 the back of
   * the object is reachable without the viewer physically walking round it.
   */
  gain?: number;
  /** Fraction of the remaining rotation covered per frame; lower = floatier. */
  smoothing?: number;
}

export interface DeviceAttitude {
  /** Whether to offer the control at all. */
  supported: boolean;
  /** Whether motion is currently switched on (persisted site-wide). */
  enabled: boolean;
  status: MotionStatus;
  /** Flip it, prompting for motion access if the platform gates it. */
  toggle: () => Promise<MotionStatus>;
  /** Treat the pose the device is in right now as facing the object. */
  recenter: () => void;
}

/** How long to wait for a usable sample before deciding there is no sensor. */
const WATCHDOG_MS = 2500;
/** Below this the smoothing has arrived; the frame loop stops until the next sample. */
const SETTLED = 0.0015; // radians — under a tenth of a degree

export function useDeviceAttitude({
  onRotate,
  onRest,
  gain = 1.5,
  smoothing = 0.18,
}: DeviceAttitudeOptions): DeviceAttitude {
  const reducedMotion = useReducedMotion();
  // Both resolve on the client only: the server has no sensor and no
  // localStorage, and a first render that disagreed would hydrate-mismatch.
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MotionStatus>('unsupported');

  // Handlers live in refs so a caller passing inline closures (the normal case)
  // doesn't tear down and re-arm the sensor on every render.
  const onRotateRef = useRef(onRotate);
  const onRestRef = useRef(onRest);
  onRotateRef.current = onRotate;
  onRestRef.current = onRest;

  const recenterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setSupported(false);
      return;
    }
    setSupported(motionCapableDevice());
  }, [reducedMotion]);

  useEffect(() => {
    const consent = readMotionConsent();
    // Where the platform gates the sensor there must be an explicit grant.
    // Everywhere else the event fires freely, so motion is on unless it was
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

    // The pose the viewer opened in is "facing the object", so however they are
    // holding the phone when they arrive is the front view.
    let neutral: Quat | null = null;
    let target: Quat = IDENTITY;
    let current: Quat = IDENTITY;
    let frame = 0;
    let live = false;

    const step = () => {
      frame = 0;
      current = nlerp(current, target, smoothing);
      const settled = angleBetween(current, target) < SETTLED;
      if (settled) current = target;
      onRotateRef.current(current);
      if (!settled) frame = requestAnimationFrame(step);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      const { alpha, beta, gamma } = event;
      // A browser that fires the event with nulls has no sensor behind it —
      // leave the watchdog to stand the whole thing down.
      if (alpha === null || beta === null || gamma === null) return;

      const device = deviceQuaternion(alpha, beta, gamma, screenAngle());
      if (!neutral) neutral = device;

      target = orbitRotation(device, neutral, gain);
      if (!live) {
        live = true;
        setStatus('active');
      }
      schedule();
    };

    // Rotating the screen re-maps the axes mid-flight; take the new pose as the
    // front view rather than letting the object snap a quarter turn.
    const onRecenter = () => {
      neutral = null;
      target = IDENTITY;
      schedule();
    };

    recenterRef.current = onRecenter;

    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    window.addEventListener('orientationchange', onRecenter, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', onRecenter);

    const watchdog = window.setTimeout(() => {
      if (!live) setSupported(false);
    }, WATCHDOG_MS);

    return () => {
      recenterRef.current = null;
      window.clearTimeout(watchdog);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', onRecenter);
      window.screen?.orientation?.removeEventListener?.('change', onRecenter);
      onRestRef.current?.();
    };
  }, [supported, enabled, gain, smoothing]);

  const toggle = useCallback(async (): Promise<MotionStatus> => {
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
