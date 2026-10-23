/**
 * Free-trackball rotation for the liquid globe (`components/radial/LiquidGlobe`).
 *
 * The globe used to be posed by two Euler angles, `Rx(pitch)·Ry(yaw)`. That can
 * only ever turn about the screen's x axis and the globe's own polar axis, so it
 * has a gimbal: tilt a pole to face you and a sideways drag spins the globe
 * about that pole instead of rolling it under the finger. A free trackball has
 * no preferred axis at all, so its orientation is a unit quaternion and every
 * gesture composes a rotation onto it.
 *
 * Conventions (shared with `lib/eversion` — see `types.ts` there):
 * - Body and view space are x right, y DOWN, z toward the viewer.
 * - Rotations are right-handed about their axis (Rodrigues), which in this frame
 *   is exactly the old `Ry(yaw)` (`x' = x·cos + z·sin`) and `Rx(pitch)`
 *   (`y' = y·cos − z·sin`), so a quaternion built from the old angles poses the
 *   globe identically.
 * - Quaternions are `[w, x, y, z]` (Hamilton). View-space increments compose on
 *   the LEFT (`q ← Δ·q`); body-space ones on the right.
 * - Matrices are row-major `Float64Array(9)`: `v' = M·v` is
 *   `(m0·x + m1·y + m2·z, m3·x + m4·y + m5·z, m6·x + m7·y + m8·z)`.
 *
 * Everything writes into caller-owned arrays, because the globe's frame loop
 * must not allocate.
 */

export type Quat = Float64Array;
export type Mat3 = Float64Array;
export type Vec3 = Float64Array;

const DEG = Math.PI / 180;

export function quat(): Quat {
  const q = new Float64Array(4);
  q[0] = 1;
  return q;
}

export function copyQuat(src: Quat, out: Quat): Quat {
  out[0] = src[0]!;
  out[1] = src[1]!;
  out[2] = src[2]!;
  out[3] = src[3]!;
  return out;
}

/** `a·b` (apply `b`, then `a`). `out` may alias either input. */
export function mulQuat(a: Quat, b: Quat, out: Quat): Quat {
  const aw = a[0]!,
    ax = a[1]!,
    ay = a[2]!,
    az = a[3]!;
  const bw = b[0]!,
    bx = b[1]!,
    by = b[2]!,
    bz = b[3]!;
  out[0] = aw * bw - ax * bx - ay * by - az * bz;
  out[1] = aw * bx + ax * bw + ay * bz - az * by;
  out[2] = aw * by - ax * bz + ay * bw + az * bx;
  out[3] = aw * bz + ax * by - ay * bx + az * bw;
  return out;
}

export function normalizeQuat(q: Quat): Quat {
  const n = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!) || 1;
  q[0] = q[0]! / n;
  q[1] = q[1]! / n;
  q[2] = q[2]! / n;
  q[3] = q[3]! / n;
  return q;
}

/**
 * The rotation by the rotation vector `(x, y, z)` in DEGREES — its direction is
 * the axis, its length the angle (the exponential map).
 */
export function quatFromRotvec(x: number, y: number, z: number, out: Quat): Quat {
  const angle = Math.hypot(x, y, z) * DEG;
  if (angle < 1e-12) {
    out[0] = 1;
    out[1] = out[2] = out[3] = 0;
    return out;
  }
  const s = Math.sin(angle / 2) / (angle / DEG);
  out[0] = Math.cos(angle / 2);
  out[1] = x * s;
  out[2] = y * s;
  out[3] = z * s;
  return out;
}

/**
 * The rotation vector of `q`, in DEGREES (the logarithm map), taking the short
 * way round: of `q` and `−q` (the same rotation) the one with `w ≥ 0`.
 */
export function rotvecOf(q: Quat, out: Vec3): Vec3 {
  let w = q[0]!,
    x = q[1]!,
    y = q[2]!,
    z = q[3]!;
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) {
    // Small angle: θ ≈ 2·sin(θ/2), so the vector is 2·(x, y, z).
    out[0] = (2 * x) / DEG;
    out[1] = (2 * y) / DEG;
    out[2] = (2 * z) / DEG;
    return out;
  }
  const angle = 2 * Math.atan2(s, w);
  const k = angle / s / DEG;
  out[0] = x * k;
  out[1] = y * k;
  out[2] = z * k;
  return out;
}

/** The pose of the old two-angle globe: `Rx(pitch)·Ry(yaw)`, both in degrees. */
export function quatFromYawPitch(yaw: number, pitch: number, out: Quat): Quat {
  const hy = (yaw * DEG) / 2;
  const hp = (pitch * DEG) / 2;
  const cy = Math.cos(hy),
    sy = Math.sin(hy);
  const cp = Math.cos(hp),
    sp = Math.sin(hp);
  // (cp, sp, 0, 0) · (cy, 0, sy, 0)
  out[0] = cp * cy;
  out[1] = sp * cy;
  out[2] = cp * sy;
  out[3] = sp * sy;
  return out;
}

export function matrixOf(q: Quat, out: Mat3): Mat3 {
  const w = q[0]!,
    x = q[1]!,
    y = q[2]!,
    z = q[3]!;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y - w * z);
  out[2] = 2 * (x * z + w * y);
  out[3] = 2 * (x * y + w * z);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z - w * x);
  out[6] = 2 * (x * z - w * y);
  out[7] = 2 * (y * z + w * x);
  out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

/**
 * The smallest rotation that carries the unit vector `(x, y, z)` to the front,
 * `(0, 0, 1)` — what turns a pin to face the viewer without twisting the globe
 * about the viewing axis on the way.
 */
export function quatToFront(x: number, y: number, z: number, out: Quat): Quat {
  // Half-way-vector construction: q = (1 + v·f, v × f), normalised. Antipodal
  // (z ≈ −1) has no unique shortest arc; any half turn about a screen axis does.
  const w = 1 + z;
  if (w < 1e-9) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 1;
    out[3] = 0;
    return out;
  }
  // v × (0, 0, 1) = (y, −x, 0)
  out[0] = w;
  out[1] = y;
  out[2] = -x;
  out[3] = 0;
  return normalizeQuat(out);
}

/**
 * The rotation vector (degrees) a pointer moving from `(ax, ay)` to `(bx, by)`
 * puts on the globe — positions in radii of the globe from its centre, y down.
 *
 * On the sphere it is the exact arcball: the arc between the two sphere points
 * under the pointer, so the glass you grabbed stays under the pointer whichever
 * way you go, including straight over a pole. Off the sphere (Shoemake's rim
 * rule) the motion is split about the centre: around it TWISTS the globe about
 * the viewing axis by the angle swept, and toward/away from it tumbles the globe
 * at one radian per radius, as a drag across the face would. The two agree at
 * the rim, where a tangential drag on the sphere is also a pure twist.
 */
export function dragRotvec(ax: number, ay: number, bx: number, by: number, out: Vec3): Vec3 {
  const ra2 = ax * ax + ay * ay;
  const rb2 = bx * bx + by * by;
  if (ra2 <= 1 && rb2 <= 1) {
    const az = Math.sqrt(1 - ra2);
    const bz = Math.sqrt(1 - rb2);
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const s = Math.hypot(cx, cy, cz);
    if (s < 1e-12) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const k = Math.atan2(s, ax * bx + ay * by + az * bz) / s / DEG;
    out[0] = cx * k;
    out[1] = cy * k;
    out[2] = cz * k;
    return out;
  }
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const r = Math.hypot(mx, my) || 1;
  const dx = bx - ax;
  const dy = by - ay;
  // Unit radial (mx, my)/r and tangent (−my, mx)/r: the tangent is the direction
  // a positive (x → y) twist carries a rim point.
  const radial = (dx * mx + dy * my) / r;
  const tangential = (dx * -my + dy * mx) / r;
  const rx = (radial * mx) / r;
  const ry = (radial * my) / r;
  out[0] = -ry / DEG;
  out[1] = rx / DEG;
  out[2] = tangential / r / DEG;
  return out;
}

export interface EulerPose {
  /** Degrees about the globe's polar axis (applied first). */
  yaw: number;
  /** Degrees about the screen's x axis, in [−90, 90]. */
  pitch: number;
  /** Degrees about the viewing axis (applied last), in (−180, 180]. */
  roll: number;
}

/**
 * Decompose `M = Rz(roll)·Rx(pitch)·Ry(yaw)` — the pose the eversion's sphere
 * takes (`lib/eversion/types.ts`, `GlobeStartState`). Any rotation has this
 * form; at `pitch = ±90°` yaw and roll are not separable and roll takes it all.
 */
export function eulerOf(m: Mat3, out: EulerPose): EulerPose {
  const sp = Math.max(-1, Math.min(1, m[7]!));
  out.pitch = Math.asin(sp) / DEG;
  if (Math.abs(sp) < 0.999999) {
    out.roll = Math.atan2(-m[1]!, m[4]!) / DEG;
    out.yaw = Math.atan2(-m[6]!, m[8]!) / DEG;
  } else {
    // Gimbal: column 1 is ±z, so only roll + yaw is defined; give it to roll.
    out.yaw = 0;
    out.roll = Math.atan2(m[3]!, m[0]!) / DEG;
  }
  return out;
}

/**
 * The Euler rates (deg/s) of {@link eulerOf}'s angles for a view-space angular
 * velocity `(wx, wy, wz)` (deg/s). With `ω = ṙ·ẑ + ṗ·Rz·x̂ + ẏ·Rz·Rx·ŷ`, solved
 * in closed form; `cos(pitch)` is floored so the yaw rate stays finite next to
 * the gimbal (where the eversion unwinds the roll anyway).
 */
export function eulerRatesOf(
  pose: EulerPose,
  wx: number,
  wy: number,
  wz: number,
  out: EulerPose,
): EulerPose {
  const cr = Math.cos(pose.roll * DEG),
    sr = Math.sin(pose.roll * DEG);
  const cp = Math.cos(pose.pitch * DEG),
    sp = Math.sin(pose.pitch * DEG);
  const cpSafe = Math.abs(cp) < 0.05 ? (cp < 0 ? -0.05 : 0.05) : cp;
  out.pitch = wx * cr + wy * sr;
  out.yaw = (-wx * sr + wy * cr) / cpSafe;
  out.roll = wz - out.yaw * sp;
  return out;
}
