/**
 * Device attitude — turning a phone's orientation sensor into "I am holding
 * this object and looking at it".
 *
 * A tilt-and-lean effect can get away with two numbers (how far left, how far
 * back). Actually inspecting an object cannot: to see a book's spine you have
 * to come round a quarter turn, and a beta/gamma pair breaks down long before
 * that — gamma is only defined over ±90° and flips sign as the phone passes
 * vertical. So this module works in quaternions, the way the site's VR head
 * look already does (`lib/neon-driftway/camera.ts`), and hands callers a
 * rotation they can hang straight off a CSS `matrix3d`.
 *
 * The model is "you walk around the object": the device's movement since the
 * viewer opened is measured as a change of heading and a change of elevation,
 * and those orbit the object about its own axes ({@link orbitRotation} explains
 * why the more obvious model reads as broken). Turn to your left and the
 * object's right-hand side comes round to meet you; raise the phone and you look
 * down over the top of it. Because the neutral pose is subtracted, it makes no
 * difference whether the platform reports `alpha` as a compass heading (Android)
 * or relative to page load (iOS): only the change since opening matters, so no
 * compass and no absolute reference is required.
 *
 * Everything here is dependency-free — no three.js, because this ships on the
 * library page rather than behind a lazy game chunk — and pure, so the maths is
 * unit-tested against three.js's own implementation instead of trusted by eye.
 *
 * Permission and consent live here too, sharing the site-wide `rmh-motion-ok`
 * grant with Settings → Appearance so nobody is asked for motion twice.
 */

/** A rotation as `[x, y, z, w]` — three.js's component order. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];

/** Shared with `components/settings/TiltEffectsRow` — one motion consent, site-wide. */
export const MOTION_CONSENT_KEY = 'rmh-motion-ok';

/** Fired on `window` when consent changes, so already-mounted listeners re-arm live. */
export const MOTION_CONSENT_EVENT = 'rmh:tilt-consent';

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

// ─── Capability, permission, consent ────────────────────────────────────────

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
 * True on hardware where moving the device is a plausible way to look at
 * something: a touch device with the event available. Desktops fire
 * `deviceorientation` with null angles (or not at all) and have a mouse for
 * dragging, so they are ruled out here rather than left to the watchdog.
 */
export function motionCapableDevice(): boolean {
  if (!orientationEventSupported()) return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Stored motion consent: `true` granted, `false` explicitly declined or turned
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

/** Persist consent and tell every mounted motion listener to re-arm. */
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
 * on a platform with no gate that is immediately `true`.
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

/**
 * The ACCELEROMETER, which is a separate permission from the orientation one
 * above.
 *
 * `deviceorientation` reports which way the device is facing; `devicemotion`
 * reports how it is being moved, and iOS gates them behind two different
 * `requestPermission` calls on two different constructors. Anything that wants
 * to know a device was *thrown* — as the temple's bowling does — needs this one,
 * and granting the other does not grant it.
 *
 * Must be called straight from a click handler, for the same reason
 * {@link requestMotionAccess} must: anything awaited first forfeits the user
 * gesture Safari is checking for.
 */
export async function requestDeviceMotionAccess(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return false;
  const request = (window.DeviceMotionEvent as unknown as MotionCtor).requestPermission;
  // No gate on this platform: the event fires freely.
  if (typeof request !== 'function') return true;
  try {
    return (await request()) === 'granted';
  } catch {
    // Thrown when called outside a gesture, or inside a cross-origin frame.
    return false;
  }
}

interface MotionCtor {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
}

/** Current screen rotation in degrees (0/90/180/270), with the legacy fallback. */
export function screenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === 'number') return angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

// ─── Quaternion maths ───────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Hamilton product `a · b` — apply `b` first, then `a`. */
export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Inverse of a unit quaternion. */
export function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function normalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len === 0) return IDENTITY;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** Rotation about a unit axis, in radians. */
export function fromAxisAngle(axis: readonly [number, number, number], angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** The total rotation angle of a quaternion, in radians (0…π). */
export function angleOf(q: Quat): number {
  return 2 * Math.acos(Math.min(1, Math.abs(normalize(q)[3])));
}

/** Rotate a vector by a quaternion. */
export function rotateVector(
  q: Quat,
  v: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z, w] = q;
  // t = 2 * (q.xyz × v); v' = v + w*t + q.xyz × t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + y * tz - z * ty,
    v[1] + w * ty + z * tx - x * tz,
    v[2] + w * tz + x * ty - y * tx,
  ];
}

/** Fold an angle into −π…π, so a turn past the wrap point is still a small one. */
export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/**
 * Normalised lerp from `a` to `b`. Cheaper than slerp and indistinguishable at
 * the per-frame step sizes used for smoothing; the sign flip takes the short
 * way round, without which a rotation past the half-turn springs backwards.
 */
export function nlerp(a: Quat, b: Quat, t: number): Quat {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  return normalize([
    a[0] + (b[0] * s - a[0]) * t,
    a[1] + (b[1] * s - a[1]) * t,
    a[2] + (b[2] * s - a[2]) * t,
    a[3] + (b[3] * s - a[3]) * t,
  ]);
}

/** How far apart two rotations are, in radians — the smoothing's settle test. */
export function angleBetween(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

/**
 * Device orientation → the device's rotation in a Y-up world whose −Z axis is
 * the direction the screen faces.
 *
 * The standard conversion (three.js's retired `DeviceOrientationControls`, and
 * the one `lib/neon-driftway/camera.ts` already uses for VR head look): a YXZ
 * euler from (beta, alpha, −gamma), rotated into the screen-facing frame, then
 * un-rotated by the screen angle so landscape and portrait agree on "forward".
 */
export function deviceQuaternion(alpha: number, beta: number, gamma: number, screen: number): Quat {
  const x = beta * DEG;
  const y = alpha * DEG;
  const z = -gamma * DEG;
  const c1 = Math.cos(x / 2);
  const s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2);
  const s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2);
  const s3 = Math.sin(z / 2);
  const euler: Quat = [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
  // −90° about X: the device frame looks along +Z out of the screen, the world
  // frame along −Z.
  const screenTransform: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  return multiply(multiply(euler, screenTransform), fromAxisAngle([0, 0, 1], -screen * DEG));
}

/**
 * Where the device is pointing on the compass, in radians, measured from where
 * it sends "forward" rather than by pulling euler angles back out — the same
 * trick `lib/neon-driftway/camera.ts` uses, and for the same reason: a naive
 * decomposition flips by 180° exactly when the device is aimed steeply up or
 * down, which is precisely when someone is looking at an object below them.
 */
export function headingOf(q: Quat): number {
  const f = rotateVector(q, [0, 0, -1]);
  if (Math.abs(f[0]) < 1e-9 && Math.abs(f[2]) < 1e-9) return 0; // straight up/down
  return Math.atan2(-f[0], -f[2]);
}

/** How far above (+) or below (−) the horizon the device is aimed, in radians. */
export function elevationOf(q: Quat): number {
  const f = rotateVector(q, [0, 0, -1]);
  return Math.asin(Math.max(-1, Math.min(1, f[1])));
}

/** Elevation stops just short of the poles, where an orbit has nowhere to go. */
const MAX_PITCH = 88 * (Math.PI / 180);

/**
 * The rotation to render an object with: an **orbit**, not the device's raw
 * attitude.
 *
 * The obvious model — put the object back where it was in the world and view it
 * from wherever the phone now is (`conj(device) · neutral`) — is faithful and
 * unusable. Because a phone is normally held pitched back rather than straight
 * up, a turn about the world's vertical arrives in the camera's frame as a
 * rotation about a tilted axis, so the book tumbles and rolls its way round
 * instead of turning. Physically right; reads as broken.
 *
 * So the device's movement is measured as two meaningful quantities — how far
 * its heading has swung, and how far above or below the horizon it now points —
 * and those are applied to the object about *its* own axes. Turning round the
 * book orbits it left and right; raising or lowering the phone orbits it over
 * the top or under the base. It never rolls, its horizon stays level, and each
 * axis of movement does exactly one thing.
 *
 * `gain` above 1 lets a comfortable turn of the wrist reach further than a
 * strict 1:1 mapping, so the back cover is available without walking round the
 * room.
 */
export function orbitRotation(device: Quat, neutral: Quat, gain = 1): Quat {
  const yaw = wrapAngle(headingOf(device) - headingOf(neutral)) * gain;
  const rawPitch = (elevationOf(device) - elevationOf(neutral)) * gain;
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, rawPitch));
  // Order is load-bearing: yaw INSIDE, about the object's own vertical, then
  // pitch about the screen's horizontal. The other way round leaves the
  // object's up axis leaning across the screen whenever both are non-zero,
  // which is the tumbling this decomposition exists to avoid.
  return multiply(fromAxisAngle([1, 0, 0], -pitch), fromAxisAngle([0, 1, 0], -yaw));
}

/**
 * A rotation as a CSS `matrix3d(...)`.
 *
 * CSS's Y axis points **down** the screen while the sensor world above has it
 * pointing up, so the quaternion is mirrored through the XZ plane on the way
 * out. Under a reflection a rotation keeps its angle but flips the sign of the
 * axis components lying in the reflected plane, which for `[x, y, z, w]` is
 * `[-x, y, -z, w]`. Without it every turn comes out backwards on one axis.
 */
export function toCssMatrix3d(q: Quat): string {
  const [ux, uy, uz, w] = normalize(q);
  const x = -ux;
  const y = uy;
  const z = -uz;

  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  // matrix3d takes its sixteen values column-major.
  // prettier-ignore
  const m = [
    1 - (yy + zz), xy + wz,       xz - wy,       0,
    xy - wz,       1 - (xx + zz), yz + wx,       0,
    xz + wy,       yz - wx,       1 - (xx + yy), 0,
    0,             0,             0,             1,
  ];
  return `matrix3d(${m.map((n) => Number(n.toFixed(6))).join(',')})`;
}
