/**
 * The liquid globe as dough: a displacement FIELD, not a handful of springs.
 *
 * Owner, 2026-10-22: the previous body "morphs like a stretchy ball … I want it to truly morph like little bits at a
 * time almost like dough". `lib/soft-body.ts` was three global modes (one tug vector, one pinch scalar, one stretch
 * matrix) around a single Gaussian at the grab point. It had no memory of WHERE material had been pushed, so the only
 * thing it could ever do is stretch as a whole. This module replaces it with state that lives in space.
 *
 * ## The model
 *
 * `u(x)` is the in-plane displacement of the material that rests at `x` (radii of the sphere, y down, centred on the
 * disc). It is held on an N×N grid and split into two layers, because dough is neither a spring nor a liquid:
 *
 * - **elastic** `e`, `ev` — an under-damped spring toward whatever the finger asks for, and toward zero otherwise.
 *   It is what rebounds, and it is the part that makes a release wobble a little.
 * - **plastic** `p` — material that has been moved and stays moved. Held strain flows into it (`FLOW`), and it decays
 *   slowly (`PLASTIC_TAU`), so a dent outlives the finger, then eases out over a couple of seconds.
 *
 * A press asks the elastic layer for a radial push out of the contact (`pressTarget`): zero at the fingertip, peaking
 * one footprint away. Out-of-plane height is DERIVED, not simulated: `h = -HEIGHT_GAIN · ∇·u`. Material pushed away
 * from the contact (∇·u > 0) leaves a dent; material piling up where the push stops (∇·u < 0) rises as a shoulder. That
 * makes volume conservation exact by construction — the discrete divergence of a field that vanishes at the border
 * sums to zero — so a dent can never simply delete mass (asserted in the tests).
 *
 * A drag grips: each step the material under the finger is carried by the finger's own motion
 * (`GRIP`), so it banks up ahead and leaves a groove behind, and the groove is what the plastic layer remembers. The
 * ball is kneaded a little at a time instead of being stretched as a whole.
 *
 * It is a reduced model on purpose (an N=48 grid, two layers, five parameters), not a finite-element solver: one
 * step is ~2·N² multiply-adds, it allocates nothing, and `step` reports when the whole field is at rest so the caller
 * can stop painting.
 */

/** Grid resolution along each axis. 48² cells are enough for a footprint of ~5 cells. */
export const DOUGH_N = 48;
/** The grid spans [-EXTENT, EXTENT]² radii. >1 so the limb can bulge past the rest silhouette. */
export const DOUGH_EXTENT = 1.3;
/** Finger footprint, in radii. */
export const CONTACT = 0.3;
/** Peak radial push of a full press, in radii. */
export const PRESS_PUSH = 0.17;
/** Height per unit of divergence. Sets how deep the dent is for a given push. */
export const HEIGHT_GAIN = 0.12;
/** Elastic layer: period (s) and damping ratio. ζ < 1 so a release wobbles, but only just. */
const ELASTIC_PERIOD = 0.42;
const ELASTIC_ZETA = 0.42;
const K_E = ((2 * Math.PI) / ELASTIC_PERIOD) ** 2;
const C_E = 2 * ELASTIC_ZETA * ((2 * Math.PI) / ELASTIC_PERIOD);
/** 1/s at which held elastic strain becomes plastic. */
const FLOW = 0.9;
/** Seconds for plastic strain to ease out. */
export const PLASTIC_TAU = 1.4;
/** Radii²/s of smoothing: keeps features round and the grid stable. */
const NU_E = 0.0035;
const NU_P = 0.012;
/** Share of the finger's own motion the material under it is carried by. */
const GRIP_PLASTIC = 0.5;
const GRIP_ELASTIC = 0.28;
/** Soft ceiling on |u| (radii). A saturating curve, not a hard clamp, so nothing pops. */
const U_MAX = 0.36;
/** Press pressure: 1/s toward 1 while held, toward 0 after. */
const PRESS_RATE = 16;
const RELEASE_RATE = 9;
/** ~0.05 px on a 170 px radius: below this nothing is visible and the field is put to sleep. */
const REST = 3e-4;
/** Internal ceiling on each layer, so a violent flick cannot bank up state the display never showed. */
const LAYER_MAX = 0.6;
const MAX_STEP = 1 / 60;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Press displacement at offset (dx, dy) from the contact: radial, 0 at the centre, peak at `CONTACT`. */
export function pressTarget(dx: number, dy: number, out: { x: number; y: number }): void {
  const r2 = dx * dx + dy * dy;
  const r = Math.sqrt(r2);
  if (r < 1e-6) {
    out.x = out.y = 0;
    return;
  }
  const s = r / CONTACT;
  const f = s * Math.exp(0.5 * (1 - s * s));
  out.x = (dx / r) * f * PRESS_PUSH;
  out.y = (dy / r) * f * PRESS_PUSH;
}

export class DoughBody {
  readonly n = DOUGH_N;
  readonly extent = DOUGH_EXTENT;
  /** Grid spacing, radii. */
  readonly h = (2 * DOUGH_EXTENT) / (DOUGH_N - 1);
  /** The grab point, clamped to the limb. */
  gx = 0;
  gy = 0;
  /** Current press pressure, 0..1. */
  pinch = 0;
  /**
   * RGBA32F-ready snapshot of the field for the shader: R,G = total in-plane displacement, B = height, A = 0.
   * Row 0 is y = -EXTENT (top). Rewritten by every `step` that changes anything; `version` increments with it.
   */
  readonly field = new Float32Array(DOUGH_N * DOUGH_N * 4);
  version = 0;

  private readonly ex = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly ey = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly evx = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly evy = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly px = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly py = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly ux = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly uy = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly hh = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly lapX = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly lapY = new Float32Array(DOUGH_N * DOUGH_N);
  private readonly mask = new Float32Array(DOUGH_N * DOUGH_N);
  private held = false;
  private vx = 0;
  private vy = 0;
  private awake = false;
  private readonly tmp = { x: 0, y: 0 };

  constructor() {
    const e = DOUGH_EXTENT;
    for (let j = 0; j < DOUGH_N; j++) {
      for (let i = 0; i < DOUGH_N; i++) {
        const x = -e + i * this.h;
        const y = -e + j * this.h;
        // Material exists on the disc; the field fades out past the limb so the border is exactly still.
        this.mask[j * DOUGH_N + i] = 1 - smooth(1.02, 1.27, Math.hypot(x, y));
      }
    }
  }

  /** Take hold at (x, y). */
  grab(x: number, y: number): void {
    this.held = true;
    this.at(x, y);
    this.vx = this.vy = 0;
    this.awake = true;
  }

  /** The finger is at (x, y), moving at (vx, vy) radii per second. */
  drag(x: number, y: number, vx: number, vy: number): void {
    this.at(x, y);
    this.vx = vx;
    this.vy = vy;
    this.awake = true;
  }

  /** Let go: the elastic layer rebounds, the plastic layer eases out, carrying whatever it holds. */
  release(): void {
    this.held = false;
    this.vx = this.vy = 0;
  }

  /** A shove from display-side events (a strike, a hand-off): a broad impulse on the elastic layer. */
  nudge(vx: number, vy: number, gain = 1): void {
    const k = 0.2 * gain;
    for (let j = 0; j < DOUGH_N; j++) {
      for (let i = 0; i < DOUGH_N; i++) {
        const c = j * DOUGH_N + i;
        const x = -DOUGH_EXTENT + i * this.h;
        const y = -DOUGH_EXTENT + j * this.h;
        const w = Math.exp(-(x * x + y * y) / 1.1) * this.mask[c]!;
        this.evx[c] = this.evx[c]! + vx * k * w;
        this.evy[c] = this.evy[c]! + vy * k * w;
      }
    }
    this.awake = true;
  }

  /** Advance `dt` seconds. Returns whether anything is (still) deformed: the caller repaints while it is. */
  step(dt: number): boolean {
    if (!this.awake && !this.held) return false;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6) {
      const d = Math.min(MAX_STEP, remaining);
      this.substep(d);
      remaining -= d;
    }
    this.derive();
    if (!this.held && this.settled()) {
      this.clear();
      this.awake = false;
      this.version++;
      return true;
    }
    this.version++;
    return true;
  }

  /** Is the body deformed at all? */
  active(): boolean {
    return this.held || this.awake;
  }

  /**
   * Where the material at rest position (x, y) is drawn now. No allocation: called for every sample of every ring and
   * every pin, every frame the body is deformed. `frontDepth` (0..1, 1 = facing the viewer) scales the perspective
   * lift of the local height, as the old body did.
   */
  deform(x: number, y: number, out: Float64Array, frontDepth?: number): void {
    if (!this.awake) {
      out[0] = x;
      out[1] = y;
      return;
    }
    const fx = (x + DOUGH_EXTENT) / this.h;
    const fy = (y + DOUGH_EXTENT) / this.h;
    const i = Math.max(0, Math.min(DOUGH_N - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(DOUGH_N - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - i));
    const ty = Math.min(1, Math.max(0, fy - j));
    const c = j * DOUGH_N + i;
    const a = (1 - tx) * (1 - ty);
    const b = tx * (1 - ty);
    const cc = (1 - tx) * ty;
    const d = tx * ty;
    const ux = this.ux;
    const uy = this.uy;
    const x2 = x + a * ux[c]! + b * ux[c + 1]! + cc * ux[c + DOUGH_N]! + d * ux[c + DOUGH_N + 1]!;
    const y2 = y + a * uy[c]! + b * uy[c + 1]! + cc * uy[c + DOUGH_N]! + d * uy[c + DOUGH_N + 1]!;
    let k = 1;
    if (frontDepth !== undefined && frontDepth > 0) {
      const hh = this.hh;
      const h = a * hh[c]! + b * hh[c + 1]! + cc * hh[c + DOUGH_N]! + d * hh[c + DOUGH_N + 1]!;
      k = 1 / (1 - h * frontDepth * 0.22);
    }
    out[0] = x2 * k;
    out[1] = y2 * k;
  }

  /** Height (radii, + toward the viewer) at (x, y). Dents are negative. */
  depth(x: number, y: number): number {
    if (!this.awake) return 0;
    const fx = (x + DOUGH_EXTENT) / this.h;
    const fy = (y + DOUGH_EXTENT) / this.h;
    const i = Math.max(0, Math.min(DOUGH_N - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(DOUGH_N - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - i));
    const ty = Math.min(1, Math.max(0, fy - j));
    const c = j * DOUGH_N + i;
    const hh = this.hh;
    return (
      (1 - tx) * (1 - ty) * hh[c]! +
      tx * (1 - ty) * hh[c + 1]! +
      (1 - tx) * ty * hh[c + DOUGH_N]! +
      tx * ty * hh[c + DOUGH_N + 1]!
    );
  }

  /** Σh over the grid. ~0 by construction (volume conservation); exposed for the tests and the debug overlay. */
  volume(): number {
    let s = 0;
    for (let c = 0; c < this.hh.length; c++) s += this.hh[c]!;
    return s;
  }

  /** Largest |u| anywhere, radii. */
  peak(): number {
    let m = 0;
    for (let c = 0; c < this.ux.length; c++) {
      m = Math.max(m, Math.hypot(this.ux[c]!, this.uy[c]!));
    }
    return m;
  }

  private substep(dt: number): void {
    const N = DOUGH_N;
    const { ex, ey, evx, evy, px, py, lapX, lapY, mask } = this;
    const held = this.held;
    // Pressure rises quickly under a held finger and falls away after it.
    this.pinch +=
      ((held ? 1 : 0) - this.pinch) * Math.min(1, (held ? PRESS_RATE : RELEASE_RATE) * dt);
    const gripE = held ? GRIP_ELASTIC * dt : 0;
    const gripP = held ? GRIP_PLASTIC * dt : 0;
    const press = this.pinch;
    const sigma2 = 2 * CONTACT * CONTACT;
    // The press target is ~4e-4 radii at 4.2 footprints, so cutting it off there leaves no visible edge.
    const reach = (4.2 * CONTACT) ** 2;
    const tmp = this.tmp;
    const flow = Math.min(1, FLOW * dt);
    const decay = Math.exp(-dt / PLASTIC_TAU);
    // ν∇²u as a rate: ν/h² times the unscaled 5-point stencil.
    const diffE = (NU_E / (this.h * this.h)) * dt;
    const diffP = (NU_P / (this.h * this.h)) * dt;

    this.laplacian(ex, ey, lapX, lapY);
    for (let j = 0; j < N; j++) {
      const y = -DOUGH_EXTENT + j * this.h;
      for (let i = 0; i < N; i++) {
        const c = j * N + i;
        const x = -DOUGH_EXTENT + i * this.h;
        let tx = 0;
        let ty = 0;
        let near = 0;
        if (press > 1e-3) {
          const dx = x - this.gx;
          const dy = y - this.gy;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach) {
            pressTarget(dx, dy, tmp);
            tx = tmp.x * press;
            ty = tmp.y * press;
            near = Math.exp(-d2 / sigma2);
          }
        }
        // Elastic spring: toward the press target while pressed, toward rest otherwise.
        evx[c] = evx[c]! + (K_E * (tx - ex[c]!) - C_E * evx[c]!) * dt;
        evy[c] = evy[c]! + (K_E * (ty - ey[c]!) - C_E * evy[c]!) * dt;
        let nex = ex[c]! + evx[c]! * dt + diffE * lapX[c]!;
        let ney = ey[c]! + evy[c]! * dt + diffE * lapY[c]!;
        // The finger carries the material under it.
        nex += this.vx * gripE * near;
        ney += this.vy * gripE * near;
        // Held strain flows into the plastic layer, which then eases out slowly.
        const fx = nex * flow;
        const fy = ney * flow;
        nex -= fx;
        ney -= fy;
        px[c] = (px[c]! + fx + this.vx * gripP * near) * decay;
        py[c] = (py[c]! + fy + this.vy * gripP * near) * decay;
        ex[c] = nex;
        ey[c] = ney;
      }
    }
    // The plastic layer has no spring to round it, so it is smoothed explicitly; then everything is held to the disc.
    this.laplacian(px, py, lapX, lapY);
    for (let c = 0; c < N * N; c++) {
      const m = mask[c]!;
      px[c] = (px[c]! + diffP * lapX[c]!) * m;
      py[c] = (py[c]! + diffP * lapY[c]!) * m;
      ex[c] = ex[c]! * m;
      ey[c] = ey[c]! * m;
      evx[c] = evx[c]! * m;
      evy[c] = evy[c]! * m;
      const pm = Math.hypot(px[c]!, py[c]!);
      if (pm > LAYER_MAX) {
        px[c] = (px[c]! * LAYER_MAX) / pm;
        py[c] = (py[c]! * LAYER_MAX) / pm;
      }
      const em = Math.hypot(ex[c]!, ey[c]!);
      if (em > LAYER_MAX) {
        ex[c] = (ex[c]! * LAYER_MAX) / em;
        ey[c] = (ey[c]! * LAYER_MAX) / em;
      }
    }
  }

  /** Unscaled 5-point stencil (Σ neighbours − 4·centre); the caller applies ν/h². Border cells give 0. */
  private laplacian(sx: Float32Array, sy: Float32Array, ox: Float32Array, oy: Float32Array): void {
    const N = DOUGH_N;
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const c = j * N + i;
        ox[c] = sx[c - 1]! + sx[c + 1]! + sx[c - N]! + sx[c + N]! - 4 * sx[c]!;
        oy[c] = sy[c - 1]! + sy[c + 1]! + sy[c - N]! + sy[c + N]! - 4 * sy[c]!;
      }
    }
  }

  /** Total displacement, derived height, and the shader's snapshot. */
  private derive(): void {
    const N = DOUGH_N;
    const { ex, ey, px, py, ux, uy, hh, field } = this;
    for (let c = 0; c < N * N; c++) {
      let x = ex[c]! + px[c]!;
      let y = ey[c]! + py[c]!;
      // Saturate smoothly: |u| → U_MAX asymptotically.
      const m = Math.hypot(x, y);
      if (m > 1e-9) {
        const s = 1 / Math.pow(1 + Math.pow(m / U_MAX, 4), 0.25);
        x *= s;
        y *= s;
      }
      ux[c] = x;
      uy[c] = y;
    }
    const inv2h = 1 / (2 * this.h);
    hh.fill(0);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const c = j * N + i;
        const div = (ux[c + 1]! - ux[c - 1]!) * inv2h + (uy[c + N]! - uy[c - N]!) * inv2h;
        hh[c] = -HEIGHT_GAIN * div;
      }
    }
    for (let c = 0; c < N * N; c++) {
      const o = c * 4;
      field[o] = ux[c]!;
      field[o + 1] = uy[c]!;
      field[o + 2] = hh[c]!;
      field[o + 3] = 0;
    }
  }

  private settled(): boolean {
    const { ex, ey, evx, evy, px, py } = this;
    for (let c = 0; c < ex.length; c++) {
      if (
        Math.abs(ex[c]!) > REST ||
        Math.abs(ey[c]!) > REST ||
        Math.abs(evx[c]!) > REST * 6 ||
        Math.abs(evy[c]!) > REST * 6 ||
        Math.abs(px[c]!) > REST ||
        Math.abs(py[c]!) > REST
      ) {
        return false;
      }
    }
    return this.pinch < 1e-3;
  }

  private clear(): void {
    for (const a of [
      this.ex,
      this.ey,
      this.evx,
      this.evy,
      this.px,
      this.py,
      this.ux,
      this.uy,
      this.hh,
      this.field,
    ]) {
      a.fill(0);
    }
    this.pinch = 0;
  }

  private at(x: number, y: number): void {
    // On the disc: a grab from the overlay around the globe takes hold of the nearest point of its limb.
    const r = Math.hypot(x, y);
    const k = r > 0.98 ? 0.98 / r : 1;
    this.gx = x * k;
    this.gy = y * k;
  }
}
