/**
 * The globe's physics and rotation, with no DOM and no renderer: the same laws the liquid globe ran
 * (`components/radial/LiquidGlobe.tsx`), lifted out so the chrome globe obeys them too (owner, 2026-11-12: "the
 * chrome globe needs to have the same physics and rotation logic as the liquid globe").
 *
 * Nothing here is a new formula. The primitives are the shared ones:
 *   - `lib/trackball`  a free trackball. Orientation is a quaternion; a drag is the exact arcball.
 *   - `lib/fluid`      the settle spring, the windowed release velocity, the coast's friction, the ripple wavelet.
 *   - `lib/dough`      the dough body: a displacement field with an elastic and a plastic layer.
 * and every constant below is the liquid globe's own number.
 *
 * What it does, in the order one step runs (project, then move, then paint: the magnet needs to know which pin is
 * nearest the reticle AND it moves the globe in response):
 *   1. ripples age and are pruned; the wobble (the ball rocking from a poke) springs back to zero
 *   2. the dough field advances; a drag grips the material under the finger and carries it
 *   3. a settle (the release throw landing on a destination, or the keyboard glide) rides one interruptible spring
 *   4. otherwise the globe coasts on friction
 *   5. the true projection of every destination, and which one is inside the reticle (the lock)
 *   6. a hold on a locked destination eases it to dead centre; an untouched globe drifts on the ambient tick
 *   7. the dwell ring fills while held on a lock and drains faster than it fills otherwise
 *
 * Display-only motion (the ripple, the wobble, the dough) never reaches the hit test: `px/py/pz` and `lock` come from
 * the real orientation, so a decoration cannot shake a destination into or out of the reticle under a finger.
 *
 * Axes are the screen's: x right, y DOWN, z toward the viewer. Rotation vectors are degrees, angular velocity deg/s.
 */
import { clamp01 } from '@/lib/core/math';
import { DoughBody } from '@/lib/dough';
import {
  DECELERATION,
  RIPPLE,
  VelocityTracker,
  gestureConfidence,
  projectDistance,
  rippleWave,
  spring,
  springStep,
  unprojectSphere,
} from '@/lib/fluid';
import {
  copyQuat,
  dragRotvec,
  matrixOf,
  mulQuat,
  normalizeQuat,
  quat,
  quatFromRotvec,
  quatToFront,
  rotvecOf,
  type Quat,
} from '@/lib/trackball';

const DEG = Math.PI / 180;

/** The spring that carries every settle: the release throw, the magnet and the keyboard glide. */
export const SETTLE_SPRING = spring(0.62, 0.1);
/** A docked globe's spin kick per pixel scrolled (deg/s), and the most a scroll can add to it. */
export const SCROLL_SPIN = 4;
export const SCROLL_SPIN_MAX = 220;
/** Idle drift (deg/s), until the visitor first takes hold. */
export const IDLE_SPIN = 5.5;
/** How long an ambient globe that was let go of sits still before it may drift again, ms. */
export const AMBIENT_RESUME_MS = 4000;
/** Hold required after an exploratory, low-speed approach. */
export const DWELL_MS = 620;
/** Hold required after a decisive flick. Never goes below this. */
export const DWELL_MIN_MS = 260;
/** Angular speed (deg/s) at or under which an approach reads as browsing, and at or over which as certainty. */
export const BROWSING_SPEED = 150;
export const DECISIVE_SPEED = 620;
/** The ring drains faster than it fills, so a mis-lock costs nothing. */
export const DRAIN_SCALE = 0.42;
/** Runaway flick guard, deg/s. */
export const MAX_SPIN = 900;
/** Perspective, as a multiple of the stage's width. */
export const PERSP = 3.1;
/** Foreshortening at depth `z` on the unit sphere (1 front, -1 back). */
export const kAt = (z: number) => PERSP / (PERSP - z * 0.5);
/** The reticle's radius on the unit sphere. Magnetism reaches no further than this. */
export const RETICLE = 0.26;
/** The reticle's on-screen diameter as a fraction of the stage's width. */
export const RETICLE_FRACTION = RETICLE * kAt(1);
export const MAX_RIPPLES = 3;
/** The wobble: an under-damped spring back to zero, kicked by the torque of an off-centre poke. */
const WOBBLE_SPRING = spring(0.78, 0.62);
const WOBBLE_DEG = 5.5;
const WOBBLE_REST = 0.02;
const WOBBLE_KICK = (() => {
  const omega = Math.sqrt(WOBBLE_SPRING.stiffness / WOBBLE_SPRING.mass);
  const zeta = WOBBLE_SPRING.damping / (2 * Math.sqrt(WOBBLE_SPRING.stiffness * WOBBLE_SPRING.mass));
  return omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
})();
/** A pointer that has not moved for this long is "stationary": the magnet may act and the dough stops being carried. */
const STATIONARY_MS = 110;
const GOLDEN_DEG = 180 * (3 - Math.sqrt(5));

/** A destination fixed on the sphere, as direction cosines. */
export interface GlobePoint {
  bx: number;
  by: number;
  bz: number;
}

interface Ripple extends GlobePoint {
  t0: number;
}

/**
 * Fibonacci-sphere placement over the whole globe. Deterministic from the count, so the same list always puts the same
 * destination on the same face: this is navigation, and muscle memory is the point.
 */
export function placePoints(n: number): GlobePoint[] {
  const out: GlobePoint[] = [];
  for (let i = 0; i < n; i++) {
    const sinLat = n <= 1 ? 0 : 1 - (2 * (i + 0.5)) / n;
    const lat = Math.asin(sinLat);
    const lon = (((i * GOLDEN_DEG) % 360) - 180) * DEG;
    const cl = Math.cos(lat);
    out.push({ bx: cl * Math.sin(lon), by: -Math.sin(lat), bz: cl * Math.cos(lon) });
  }
  return out;
}

export interface StepInput {
  /** Seconds of idle drift due this frame (the ambient tick), or 0. */
  tick: number;
  /** Keyboard focus is inside the globe: an ambient globe keeps its pose. */
  focusInside: boolean;
}

export class GlobeEngine {
  /** The real orientation and angular velocity. */
  readonly q: Quat = quat();
  readonly w = new Float64Array(3);
  /** The DRAWN rotation, row-major 3x3: the real one plus the wobble. Body point b is drawn at `drawM . b`. */
  readonly drawM = new Float64Array(9);
  /** The true projection of each destination (view space, unit sphere). Read after `step`. */
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  /** The destination inside the reticle, or -1. */
  lock = -1;
  /** The dwell ring, 0..1, and whether it is full. */
  fill = 0;
  ready = false;
  readonly dough = new DoughBody();
  /** True while the dough is deformed (set by `step`). */
  soft = false;
  /** An ambient globe (docked) drifts until taken hold of, and lets go again after AMBIENT_RESUME_MS. */
  ambient = true;
  /** Someone has taken hold: the idle drift stops. */
  touched = false;
  /** A fine pointer rests on the globe: the idle drift pauses. */
  hovering = false;
  dragging = false;
  held = false;

  private readonly points: readonly GlobePoint[];
  private readonly ripples: Ripple[] = [];
  private wobble: { yaw: number; vYaw: number; pitch: number; vPitch: number } | null = null;
  private settle: Quat | null = null;
  private readonly grabAt = { x: 0, y: 0 };
  private readonly spinV = [new VelocityTracker(), new VelocityTracker(), new VelocityTracker()];
  private readonly turned = new Float64Array(3);
  private peakSpeed = 0;
  private dwell = DWELL_MS;
  private lastMoveAt = 0;
  private last = 0;
  private dirty = true;
  /** Scratch. */
  private readonly sq = quat();
  private readonly sq2 = quat();
  private readonly sv = new Float64Array(3);
  private readonly sm = new Float64Array(9);
  private readonly tm = new Float64Array(9);
  private readonly drawQ = quat();

  constructor(points: readonly GlobePoint[]) {
    this.points = points;
    this.px = new Float64Array(points.length);
    this.py = new Float64Array(points.length);
    this.pz = new Float64Array(points.length);
    matrixOf(this.q, this.drawM);
    this.project(this.drawM);
  }

  /** `q <- exp(v).q`: turn `q` by the view-space rotation vector `v` (degrees). */
  private turn(q: Quat, vx: number, vy: number, vz: number): void {
    if (vx === 0 && vy === 0 && vz === 0) return;
    mulQuat(quatFromRotvec(vx, vy, vz, this.sq), q, q);
    normalizeQuat(q);
  }

  /** The orientation that brings body point `b` to dead centre from `q` by the shortest turn (no twist). */
  private facing(q: Quat, b: GlobePoint, out: Quat): Quat {
    const m = matrixOf(q, this.sm);
    const x = m[0]! * b.bx + m[1]! * b.by + m[2]! * b.bz;
    const y = m[3]! * b.bx + m[4]! * b.by + m[5]! * b.bz;
    const z = m[6]! * b.bx + m[7]! * b.by + m[8]! * b.bz;
    quatToFront(x, y, z, this.sq2);
    return normalizeQuat(mulQuat(this.sq2, q, out));
  }

  private project(m: Float64Array): void {
    let lockD = Infinity;
    this.lock = -1;
    for (let i = 0; i < this.points.length; i++) {
      const n = this.points[i]!;
      const x = m[0]! * n.bx + m[1]! * n.by + m[2]! * n.bz;
      const y = m[3]! * n.bx + m[4]! * n.by + m[5]! * n.bz;
      const z = m[6]! * n.bx + m[7]! * n.by + m[8]! * n.bz;
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      if (z <= 0) continue;
      const d = Math.hypot(x, y);
      if (d < RETICLE && d < lockD) {
        lockD = d;
        this.lock = i;
      }
    }
  }

  /** Something outside changed what is drawn (a resize, a new pose): repaint on the next step. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Turn at once so destination `i` faces the viewer (the "you are here" pose a menu opens on). */
  orient(i: number): void {
    const p = this.points[i];
    if (!p) return;
    this.facing(this.q, p, this.q);
    this.w.fill(0);
    this.settle = null;
    this.dirty = true;
  }

  /** Glide until destination `i` faces the viewer (keyboard focus turns the globe). */
  face(i: number): void {
    const p = this.points[i];
    if (!p) return;
    this.settle = this.facing(this.q, p, quat());
    this.w.fill(0);
    this.touched = true;
    this.dirty = true;
  }

  /**
   * A poke at (x, y), in radii from the globe's centre: it rocks the ball (a torque, `r x F`, with the force straight
   * down the viewing axis, so dead centre rocks nothing and the limb rocks most), shoves the dough, and starts a
   * ripple stored in BODY space so the wave travels with the surface it is crossing.
   */
  strike(x: number, y: number, now: number): void {
    const hit = unprojectSphere(x, y, PERSP);
    if (!hit) return;
    const w = (this.wobble ??= { yaw: 0, vYaw: 0, pitch: 0, vPitch: 0 });
    w.vYaw -= hit.x * WOBBLE_DEG * WOBBLE_KICK;
    w.vPitch += hit.y * WOBBLE_DEG * WOBBLE_KICK;
    this.dough.nudge(-hit.x * 8, hit.y * 8, 1.1);
    const m = matrixOf(this.q, this.sm);
    // The transpose un-rotates (the matrix is orthonormal).
    const impact: Ripple = {
      bx: m[0]! * hit.x + m[3]! * hit.y + m[6]! * hit.z,
      by: m[1]! * hit.x + m[4]! * hit.y + m[7]! * hit.z,
      bz: m[2]! * hit.x + m[5]! * hit.y + m[8]! * hit.z,
      t0: now,
    };
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.splice(0, this.ripples.length - MAX_RIPPLES + 1);
    this.ripples.push(impact);
    this.dirty = true;
  }

  /** Take hold at (x, y), radii from the centre. Strikes first: a press is a poke that does not let go. */
  grab(x: number, y: number, now: number): void {
    this.strike(x, y, now);
    this.grabAt.x = x;
    this.grabAt.y = y;
    this.dough.grab(x, y);
    this.dragging = true;
    this.held = true;
    if (!this.settle) this.peakSpeed = 0;
    this.w.fill(0);
    this.settle = null;
    this.touched = true;
    this.lastMoveAt = now;
    this.turned.fill(0);
    for (const v of this.spinV) {
      v.reset();
      v.add(0, now);
    }
  }

  /** The held pointer is now at (x, y). */
  move(x: number, y: number, now: number): void {
    if (!this.dragging) return;
    this.lastMoveAt = now;
    const at = this.grabAt;
    dragRotvec(at.x, at.y, x, y, this.sv);
    at.x = x;
    at.y = y;
    const v0 = this.sv[0]!;
    const v1 = this.sv[1]!;
    const v2 = this.sv[2]!;
    this.turn(this.q, v0, v1, v2);
    const acc = this.turned;
    acc[0] = acc[0]! + v0;
    acc[1] = acc[1]! + v1;
    acc[2] = acc[2]! + v2;
    for (let a = 0; a < 3; a++) this.spinV[a]!.add(acc[a]!, now);
    const speed = Math.hypot(this.spinV[0]!.get(), this.spinV[1]!.get(), this.spinV[2]!.get());
    if (speed > this.peakSpeed) this.peakSpeed = speed;
    this.dirty = true;
  }

  /**
   * Let go. With `commit` and the ring full on a locked destination, returns that destination: the caller navigates.
   * Otherwise the globe is thrown with the drag's own windowed velocity, and if the throw's PROJECTED resting
   * orientation has a destination inside the reticle, it settles onto it. Returns -1.
   */
  release(commit: boolean): number {
    if (!this.dragging) return -1;
    this.dragging = false;
    this.held = false;
    this.dough.release();
    if (commit && this.ready && this.lock >= 0) return this.lock;
    const w = this.w;
    for (let a = 0; a < 3; a++) w[a] = this.spinV[a]!.get();
    const speed = Math.hypot(w[0]!, w[1]!, w[2]!);
    if (speed > MAX_SPIN) for (let a = 0; a < 3; a++) w[a] = (w[a]! * MAX_SPIN) / speed;
    const spin = Math.min(speed, MAX_SPIN);
    const coast = spin > 1e-6 ? projectDistance(spin, DECELERATION.normal) / spin : 0;
    const projected = copyQuat(this.q, quat());
    this.turn(projected, w[0]! * coast, w[1]! * coast, w[2]! * coast);
    const m = matrixOf(projected, this.sm);
    let best = -1;
    let bestD = RETICLE;
    for (let i = 0; i < this.points.length; i++) {
      const n = this.points[i]!;
      if (m[6]! * n.bx + m[7]! * n.by + m[8]! * n.bz <= 0) continue;
      const d = Math.hypot(m[0]! * n.bx + m[1]! * n.by + m[2]! * n.bz, m[3]! * n.bx + m[4]! * n.by + m[5]! * n.bz);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.settle = best >= 0 ? this.facing(projected, this.points[best]!, projected) : null;
    this.dirty = true;
    return -1;
  }

  /** The hold ended without a release (the window lost focus): the ring drains; the globe is not thrown. */
  drop(): void {
    if (!this.dragging && !this.held) return;
    this.dragging = false;
    this.held = false;
    this.dough.release();
  }

  /** The page scrolled by `dy` px under a docked globe: kick its spin about the vertical. */
  scroll(dy: number): void {
    if (dy === 0 || this.dragging || this.settle) return;
    this.w[1] = Math.max(-SCROLL_SPIN_MAX, Math.min(SCROLL_SPIN_MAX, this.w[1]! + dy * SCROLL_SPIN));
  }

  /** The globe was put down at `now` (the menu closed): an ambient globe waits AMBIENT_RESUME_MS from here. */
  rested(now: number): void {
    this.lastMoveAt = now;
  }

  /** May the idle drift advance? */
  get drifts(): boolean {
    return !this.touched && !this.hovering;
  }

  /** ms until an ambient globe that was let go of may drift again, or 0. */
  letGoIn(now: number): number {
    if (!this.ambient || !this.touched) return 0;
    return Math.max(0, this.lastMoveAt + AMBIENT_RESUME_MS + 1 - now);
  }

  /** Radial swell of body point `b` from the live ripples, as a fraction of the radius. */
  waveAt(b: GlobePoint, now: number): number {
    if (this.ripples.length === 0) return 0;
    let sum = 0;
    for (const r of this.ripples) {
      const c = Math.max(-1, Math.min(1, b.bx * r.bx + b.by * r.by + b.bz * r.bz));
      sum += rippleWave({ age: (now - r.t0) / 1000, distance: Math.acos(c) });
    }
    return sum;
  }

  /**
   * The live ripples for a shader, in VIEW space: (x, y, z, age in seconds) each, age -1 for an empty slot.
   * `out` holds MAX_RIPPLES * 4 numbers.
   */
  ripplesInto(out: Float32Array, now: number): void {
    const m = this.drawM;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = this.ripples[i];
      const o = i * 4;
      if (!r) {
        out[o] = out[o + 1] = out[o + 2] = 0;
        out[o + 3] = -1;
        continue;
      }
      out[o] = m[0]! * r.bx + m[1]! * r.by + m[2]! * r.bz;
      out[o + 1] = m[3]! * r.bx + m[4]! * r.by + m[5]! * r.bz;
      out[o + 2] = m[6]! * r.bx + m[7]! * r.by + m[8]! * r.bz;
      out[o + 3] = (now - r.t0) / 1000;
    }
  }

  get rippling(): boolean {
    return this.ripples.length > 0;
  }

  /**
   * Advance to `now` (ms). Returns `{ painted, busy }`: `painted` when what is drawn changed this step (the caller
   * repaints), `busy` when the caller should step again next frame. When not busy the globe is at rest: schedule
   * nothing, or one timer to the next ambient tick.
   */
  step(now: number, input: StepInput): { painted: boolean; busy: boolean } {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const stationary = now - this.lastMoveAt > STATIONARY_MS;

    // 1. Ripples age; the wobble springs back.
    if (this.ripples.length > 0) {
      let kept = 0;
      for (let i = 0; i < this.ripples.length; i++) {
        const rip = this.ripples[i]!;
        if ((now - rip.t0) / 1000 < RIPPLE.life) this.ripples[kept++] = rip;
      }
      this.ripples.length = kept;
      this.dirty = true;
    }
    const wob = this.wobble;
    if (wob) {
      const y = springStep({ value: wob.yaw, velocity: wob.vYaw }, 0, WOBBLE_SPRING, dt);
      const p = springStep({ value: wob.pitch, velocity: wob.vPitch }, 0, WOBBLE_SPRING, dt);
      wob.yaw = y.value;
      wob.vYaw = y.velocity;
      wob.pitch = p.value;
      wob.vPitch = p.velocity;
      if (
        Math.abs(y.value) < WOBBLE_REST &&
        Math.abs(p.value) < WOBBLE_REST &&
        Math.abs(y.velocity) < WOBBLE_REST &&
        Math.abs(p.velocity) < WOBBLE_REST
      ) {
        this.wobble = null;
      }
      this.dirty = true;
    }

    // 2. The dough. A drag carries the material under the finger with the finger's own motion.
    if (this.dragging) {
      const vx = stationary ? 0 : this.spinV[1]!.get() * DEG;
      const vy = stationary ? 0 : -this.spinV[0]!.get() * DEG;
      this.dough.drag(this.grabAt.x, this.grabAt.y, vx, vy);
    }
    this.soft = this.dough.step(dt);
    if (this.soft) this.dirty = true;

    // 3. A settle: the error to the target as a rotation vector, each component on the one spring.
    const w = this.w;
    if (!this.dragging && this.settle) {
      const target = this.settle;
      const inv = this.sq2;
      inv[0] = target[0]!;
      inv[1] = -target[1]!;
      inv[2] = -target[2]!;
      inv[3] = -target[3]!;
      rotvecOf(mulQuat(this.q, inv, inv), this.sv);
      let rest = true;
      for (let a = 0; a < 3; a++) {
        const st = springStep({ value: this.sv[a]!, velocity: w[a]! }, 0, SETTLE_SPRING, dt);
        this.sv[a] = st.value;
        w[a] = st.velocity;
        if (Math.abs(st.value) >= 0.05 || Math.abs(st.velocity) >= 2) rest = false;
      }
      if (rest) {
        copyQuat(target, this.q);
        w.fill(0);
        this.settle = null;
      } else {
        normalizeQuat(mulQuat(quatFromRotvec(this.sv[0]!, this.sv[1]!, this.sv[2]!, this.sq), target, this.q));
      }
      this.dirty = true;
    }

    // 4. The free coast, on friction.
    if (!this.dragging && !this.settle) {
      const speed = Math.hypot(w[0]!, w[1]!, w[2]!);
      if (speed > 0) {
        if (speed < 1) {
          w.fill(0);
        } else {
          this.turn(this.q, w[0]! * dt, w[1]! * dt, w[2]! * dt);
          const decay = Math.pow(DECELERATION.normal, dt * 1000);
          for (let a = 0; a < 3; a++) w[a] = w[a]! * decay;
        }
        this.dirty = true;
      }
    }

    // 5. Project.
    matrixOf(this.q, this.tm);
    this.project(this.tm);

    // 6. Move in response: an ambient globe lets go; a hold eases the lock to centre; an untouched globe drifts.
    if (
      this.ambient &&
      this.touched &&
      !this.dragging &&
      !this.settle &&
      w[0] === 0 &&
      w[1] === 0 &&
      w[2] === 0 &&
      this.fill === 0 &&
      now - this.lastMoveAt > AMBIENT_RESUME_MS &&
      !input.focusInside
    ) {
      this.touched = false;
    }
    let moved = false;
    if (this.touched && !this.settle && stationary && this.held && this.lock >= 0) {
      const i = this.lock;
      rotvecOf(quatToFront(this.px[i]!, this.py[i]!, this.pz[i]!, this.sq2), this.sv);
      if (Math.hypot(this.sv[0]!, this.sv[1]!, this.sv[2]!) > 0.05) {
        const k = 1 - Math.exp(-9 * dt);
        this.turn(this.q, this.sv[0]! * k, this.sv[1]! * k, this.sv[2]! * k);
        moved = true;
      }
    } else if (this.drifts && input.tick > 0) {
      this.turn(this.q, 0, IDLE_SPIN * input.tick, 0);
      moved = true;
    }
    if (moved) {
      this.dirty = true;
      matrixOf(this.q, this.tm);
      this.project(this.tm);
    }

    // The drawn rotation: the real one plus the wobble.
    const painted = this.dirty;
    if (painted) {
      copyQuat(this.q, this.drawQ);
      if (wob) this.turn(this.drawQ, wob.pitch, wob.yaw, 0);
      matrixOf(this.drawQ, this.drawM);
      this.dirty = false;
    }

    // 7. The dwell ring. A destination ARRIVING in the reticle starts from empty; losing the lock only drains.
    const speed = Math.hypot(w[0]!, w[1]!, w[2]!);
    if (speed > this.peakSpeed) this.peakSpeed = speed;
    if (this.lock !== this.lockWas) {
      if (this.lock >= 0) {
        this.fill = 0;
        const confidence = gestureConfidence(this.peakSpeed, BROWSING_SPEED, DECISIVE_SPEED);
        this.dwell = DWELL_MS + (DWELL_MIN_MS - DWELL_MS) * confidence;
      }
      this.lockWas = this.lock;
      this.ready = false;
    }
    const holding = this.held && this.lock >= 0;
    this.fill = clamp01(
      holding
        ? this.fill + (dt * 1000) / this.dwell
        : this.fill - (dt * 1000) / (this.dwell * DRAIN_SCALE),
    );
    this.ready = this.fill >= 1;

    const busy =
      this.dragging ||
      this.held ||
      this.settle !== null ||
      speed > 0 ||
      this.ripples.length > 0 ||
      this.wobble !== null ||
      this.soft ||
      this.fill !== 0;
    if (!busy) this.last = 0;
    return { painted, busy };
  }

  private lockWas = -1;
}
