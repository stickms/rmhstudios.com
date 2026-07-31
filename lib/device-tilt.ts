/**
 * Device tilt — the browser plumbing and the maths behind "the surface moves
 * with the phone".
 *
 * A phone has no pointer, so every hover-driven depth effect on the site is
 * dead weight on the device most people browse from. The gyroscope is the
 * replacement input: `deviceorientation` reports the handset's attitude, and a
 * surface that leans with it reads as a physical object sitting behind the
 * glass rather than a picture of one.
 *
 * Three things make this awkward in practice, all handled here so callers only
 * ever see a −1…1 pair:
 *
 *  1. **iOS gates the event.** Safari needs
 *     `DeviceOrientationEvent.requestPermission()` from inside a user gesture.
 *     Nothing here ever prompts on load — {@link requestMotionAccess} is called
 *     from a button, and the grant persists as `rmh-motion-ok`, the SAME
 *     consent the Settings → Appearance "Tilt effects" row writes, so a visitor
 *     who already allowed motion is never asked twice.
 *  2. **There is no such thing as "flat".** People read at whatever angle their
 *     wrist happens to be. A fixed neutral (the usual `beta − 45`) leaves the
 *     effect pinned at full deflection for anyone holding the phone differently,
 *     so the neutral pose is learnt from the first sample and then drifts
 *     slowly toward the current one — deliberate tilts register instantly, a
 *     changed resting pose fades back to centre over a few seconds.
 *  3. **The axes rotate with the screen.** In landscape the device's front-back
 *     axis runs across the display, so the raw angles have to be rotated by
 *     `screen.orientation.angle` before they mean anything on screen.
 *
 * The React wiring (listeners, permission state, rAF smoothing) lives in
 * `hooks/useDeviceTilt.ts`; this module stays free of React so the maths is
 * directly testable.
 */

/** Shared with `components/settings/TiltEffectsRow` — one motion consent, site-wide. */
export const MOTION_CONSENT_KEY = 'rmh-motion-ok';

/** Fired on `window` when consent changes, so already-mounted listeners re-arm live. */
export const MOTION_CONSENT_EVENT = 'rmh:tilt-consent';

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/** A raw orientation reading, reduced to the two axes a flat surface can use. */
export interface TiltSample {
  /** Front-to-back tilt, degrees. */
  beta: number;
  /** Left-to-right tilt, degrees. */
  gamma: number;
}

/** Screen-space deflection, −1…1 on each axis (+x = right edge away, +y = bottom away). */
export interface TiltVector {
  x: number;
  y: number;
}

/** True where the event type exists at all (says nothing about real hardware). */
export function orientationEventSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** True only where the browser gates orientation behind a permission call (iOS). */
export function motionPermissionGateExists(): boolean {
  if (!orientationEventSupported()) return false;
  return typeof (window.DeviceOrientationEvent as OrientationCtor).requestPermission === 'function';
}

/**
 * True on hardware where tilt is the *right* input: a touch device with the
 * event available. Desktops fire `deviceorientation` with null angles (or not
 * at all) and already have a pointer driving the same effects, so they are
 * excluded here rather than left to the watchdog.
 */
export function tiltCapableDevice(): boolean {
  if (!orientationEventSupported()) return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Stored motion consent: `true` granted, `false` explicitly declined/turned
 * off, `null` never asked. The three states matter — platforms without a
 * permission gate default to on, and only an explicit `false` turns them off.
 */
export function readMotionConsent(): boolean | null {
  try {
    const raw = localStorage.getItem(MOTION_CONSENT_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  } catch {
    return null;
  }
}

/** Persist consent and tell every mounted tilt listener to re-arm. */
export function writeMotionConsent(granted: boolean): void {
  try {
    localStorage.setItem(MOTION_CONSENT_KEY, granted ? '1' : '0');
  } catch {
    /* storage disabled — consent just doesn't persist */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<boolean>(MOTION_CONSENT_EVENT, { detail: granted }));
  }
}

/**
 * Ask for motion access. **Must be called from a user gesture** — Safari
 * rejects it otherwise. Resolves to whether the events may now be listened to;
 * on platforms with no gate that is immediately `true`.
 */
export async function requestMotionAccess(): Promise<boolean> {
  if (!orientationEventSupported()) return false;
  if (!motionPermissionGateExists()) return true;
  try {
    const request = (window.DeviceOrientationEvent as OrientationCtor).requestPermission!;
    return (await request()) === 'granted';
  } catch {
    // Thrown when called outside a gesture, or inside a cross-origin frame.
    return false;
  }
}

/** Current screen rotation in degrees (0/90/180/270), with the legacy fallback. */
export function screenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === 'number') return angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/**
 * Shortest signed distance from `from` to `to` in degrees, in −180…180.
 * Without this a phone crossing the beta wrap point (±180°) would slam the
 * surface from one extreme to the other.
 */
export function angleDelta(from: number, to: number): number {
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Turn a reading into screen-space deflection, relative to `neutral` and
 * rotated into the current screen orientation.
 *
 * `range` is how many degrees of tilt count as full deflection — a wrist's
 * worth, not an arm's, so the effect is expressive without the phone having to
 * leave a comfortable reading angle.
 */
export function tiltVector(
  sample: TiltSample,
  neutral: TiltSample,
  angle: number,
  range: number,
): TiltVector {
  const dGamma = angleDelta(neutral.gamma, sample.gamma);
  const dBeta = angleDelta(neutral.beta, sample.beta);

  // Portrait: gamma is already the screen's x axis and beta its y. Landscape
  // swaps them, and the two landscape orientations disagree about sign.
  let x = dGamma;
  let y = dBeta;
  switch (((angle % 360) + 360) % 360) {
    case 90:
      x = dBeta;
      y = -dGamma;
      break;
    case 180:
      x = -dGamma;
      y = -dBeta;
      break;
    case 270:
      x = -dBeta;
      y = dGamma;
      break;
  }

  return { x: clamp(x / range, -1, 1), y: clamp(y / range, -1, 1) };
}

/**
 * Move `neutral` a fraction of the way toward the live reading, so the pose the
 * visitor has settled into becomes the new centre. `rate` is per sample; at the
 * ~60 Hz these events fire, 0.006 gives a ~3 second fade back to rest.
 */
export function driftNeutral(neutral: TiltSample, sample: TiltSample, rate: number): TiltSample {
  return {
    beta: neutral.beta + angleDelta(neutral.beta, sample.beta) * rate,
    gamma: neutral.gamma + angleDelta(neutral.gamma, sample.gamma) * rate,
  };
}
