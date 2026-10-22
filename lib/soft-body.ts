/**
 * The liquid globe as a soft body (owner, 2026-10-21: "add full soft-body physics to the liquid globe as you drag it
 * around and click it … dragging it deforms it according to your pointer/finger", and "make it super optimized").
 *
 * ## The model
 *
 * A jelly ball held at one point behaves, to the eye, like three modes, each an under-damped spring
 * (`lib/fluid` §springStep), so it wobbles back when let go and a new grab retargets it from wherever it is:
 *
 * - **Tug.** The surface under the finger leads and the body lags: the region around the grab point is displaced
 *   along the drag by `d`, falling off as a gaussian of the screen distance from the finger. `d` chases the
 *   finger's velocity times a lag (`TUG_LAG`), capped at `TUG_MAX` radii, so a slow drag barely bends the ball and a
 *   flick pulls a visible lobe after the finger.
 * - **Pinch.** A press squeezes the jelly in around the finger (`PINCH_DEPTH` of the way toward it, same falloff) for
 *   as long as it is held; the release lets it spring back out past rest and settle.
 * - **Stretch.** The whole ball squashes and stretches along the tug, volume-preserving (`s` along it, `1/√s` on both
 *   axes across it, the one on screen and the one into it), so
 *   the pull reads as the body's and not only the skin's.
 *
 * That is a reduced-order (modal) soft body rather than a particle mesh: the deformation is a closed-form field
 * evaluated at the points the globe already draws (the cage's samples, the pins), so it costs one `exp` and a dozen
 * multiplies per sample, allocates nothing, and is skipped entirely at rest (`step` says when). A mass-spring lattice
 * would cost a solver step per node per frame for a surface you only ever see as thirteen rings.
 *
 * Everything is in screen space, in radii of the sphere, y down, centred on the sphere: the units the globe's paint
 * pass already works in after projection.
 */

import { spring, springStep, type Spring } from './fluid';

/** The tug and the stretch: bouncy, so a release visibly wobbles a couple of times. */
export const JELLY_SPRING: Spring = spring(0.5, 0.6);
/** The pinch: a little quicker, so a tap reads as a squeeze. */
export const PINCH_SPRING: Spring = spring(0.36, 0.5);
/** Seconds of finger velocity the grabbed region leads the body by. */
export const TUG_LAG = 0.11;
/** The furthest the grabbed region is pulled, in radii. */
export const TUG_MAX = 0.17;
/** How far toward the finger a held press squeezes the surface around it (a fraction). */
export const PINCH_DEPTH = 0.16;
/** Gaussian falloff of the tug and the pinch around the finger, in radii (σ). */
export const FALLOFF = 0.62;
/** Stretch along the tug per radius of tug. */
export const STRETCH = 1.15;
/** Local finger footprint; the surrounding shoulder balances the indentation. */
export const CONTACT_RADIUS = 0.36;
/** Below this (radii, radii/s) every mode is at rest. */
const REST = 1e-4;

export class SoftBody {
  /** The grab point. */
  gx = 0;
  gy = 0;
  /** The tug and its velocity. */
  dx = 0;
  dy = 0;
  private vx = 0;
  private vy = 0;
  /** The tug's target (set from the finger's velocity while held). */
  private tx = 0;
  private ty = 0;
  /** The pinch and its velocity. */
  pinch = 0;
  private vp = 0;
  private held = false;
  /** The global stretch, as a 2×2 matrix, recomputed by `step`. */
  m00 = 1;
  m01 = 0;
  m10 = 0;
  m11 = 1;
  private readonly inv2s2 = 1 / (2 * FALLOFF * FALLOFF);

  /** Take hold at (x, y). */
  grab(x: number, y: number): void {
    this.held = true;
    this.at(x, y);
    this.tx = 0;
    this.ty = 0;
  }

  /** The finger is at (x, y), moving at (vx, vy) radii per second. */
  drag(x: number, y: number, vx: number, vy: number): void {
    this.at(x, y);
    let tx = vx * TUG_LAG;
    let ty = vy * TUG_LAG;
    const len = Math.hypot(tx, ty);
    if (len > TUG_MAX) {
      tx *= TUG_MAX / len;
      ty *= TUG_MAX / len;
    }
    this.tx = tx;
    this.ty = ty;
  }

  /** Let go: every mode springs back to rest from wherever it is, carrying its velocity. */
  release(): void {
    this.held = false;
    this.tx = 0;
    this.ty = 0;
  }

  /** Add a velocity impulse (radii/s) to the tug for display-side events (strikes, hand-offs). */
  nudge(vx: number, vy: number, gain = 1): void {
    let tx = this.tx + vx * TUG_LAG * gain;
    let ty = this.ty + vy * TUG_LAG * gain;
    const max = TUG_MAX * 1.45;
    const len = Math.hypot(tx, ty);
    if (len > max) {
      tx *= max / len;
      ty *= max / len;
    }
    this.tx = tx;
    this.ty = ty;
    this.vx += vx * 0.14 * gain;
    this.vy += vy * 0.14 * gain;
  }

  /** Advance `dt` seconds. Returns whether anything is (still) deformed: the caller repaints while it is. */
  step(dt: number): boolean {
    if (!this.held && this.atRest()) return false;
    const x = springStep({ value: this.dx, velocity: this.vx }, this.tx, JELLY_SPRING, dt);
    const y = springStep({ value: this.dy, velocity: this.vy }, this.ty, JELLY_SPRING, dt);
    const p = springStep(
      { value: this.pinch, velocity: this.vp },
      this.held ? PINCH_DEPTH : 0,
      PINCH_SPRING,
      dt,
    );
    this.dx = x.value;
    this.vx = x.velocity;
    this.dy = y.value;
    this.vy = y.velocity;
    this.pinch = p.value;
    this.vp = p.velocity;
    if (!this.held && this.atRest()) {
      this.dx = this.dy = this.pinch = 0;
      this.vx = this.vy = this.vp = 0;
    }
    // Volume-preserving stretch along the tug: `s` along it, `1/√s` across (on screen, and into it).
    const len = Math.hypot(this.dx, this.dy);
    if (len < REST) {
      this.m00 = this.m11 = 1;
      this.m01 = this.m10 = 0;
    } else {
      const ux = this.dx / len;
      const uy = this.dy / len;
      const s = 1 + STRETCH * len;
      const q = 1 / Math.sqrt(s);
      this.m00 = q + (s - q) * ux * ux;
      this.m11 = q + (s - q) * uy * uy;
      this.m01 = this.m10 = (s - q) * ux * uy;
    }
    return true;
  }

  /** Is the body deformed at all? */
  active(): boolean {
    return this.held || !this.atRest();
  }

  /**
   * Where the surface point drawn at (x, y) is drawn now, into `out[0]`, `out[1]`. No allocation: called for every
   * sample of every ring, every frame the body is deformed.
   */
  deform(x: number, y: number, out: Float64Array, frontDepth?: number): void {
    const ex = x - this.gx;
    const ey = y - this.gy;
    const w = Math.exp(-(ex * ex + ey * ey) * this.inv2s2);
    const pw = this.pinch * w;
    const x2 = x + this.dx * w - ex * pw;
    const y2 = y + this.dy * w - ey * pw;
    // Perspective projection of the local depth displacement, front hemisphere
    // only. The grab/selection coordinates remain undeformed in the navigator.
    const depth = frontDepth === undefined ? 0 : this.depth(x, y) * Math.max(0, frontDepth);
    const perspective = 1 / (1 - depth * 0.22);
    out[0] = (this.m00 * x2 + this.m01 * y2) * perspective;
    out[1] = (this.m10 * x2 + this.m11 * y2) * perspective;
  }

  /**
   * Normal displacement in radii: a finger dents the centre and raises a soft
   * annular shoulder. This Gaussian Laplacian integrates to zero over the
   * tangent plane, so the displaced material returns around the contact rather
   * than simply vanishing. The existing global stretch separately conserves
   * volume. This is an analytic approximation, not a finite-element solver.
   */
  depth(x: number, y: number): number {
    if (this.pinch === 0) return 0;
    const q = ((x - this.gx) ** 2 + (y - this.gy) ** 2) / CONTACT_RADIUS ** 2;
    return -this.pinch * (1 - q * 0.5) * Math.exp(-q * 0.5);
  }

  private at(x: number, y: number): void {
    // On the disc: a grab from the overlay around the globe takes hold of the nearest point of its limb.
    const r = Math.hypot(x, y);
    const k = r > 0.98 ? 0.98 / r : 1;
    this.gx = x * k;
    this.gy = y * k;
  }

  private atRest(): boolean {
    return (
      Math.abs(this.dx) < REST &&
      Math.abs(this.dy) < REST &&
      Math.abs(this.pinch) < REST &&
      Math.abs(this.vx) < REST &&
      Math.abs(this.vy) < REST &&
      Math.abs(this.vp) < REST
    );
  }
}
