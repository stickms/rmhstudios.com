/**
 * The globe cursor's engine: physics + Canvas 2D drawing of a sphere that turns
 * itself inside out, forever, at the pointer.
 *
 * ## The surface
 *
 * The eversion is the real one — Thurston's corrugation eversion from
 * `lib/eversion/thurston.ts`, the same oracle the page-transition shader is
 * checked against — sampled on a small θ×φ grid every frame (~0.3 ms at medium
 * detail). Each grid quad is two-sided: which side faces the viewer is read
 * from its normal, so the outside colour and the inside colour trade places as
 * the sphere passes through itself, which is what makes the eversion legible at
 * 34 px. In `loop` mode the two colours swap at every cycle boundary: at `e = 1`
 * the surface is the round sphere again with its inside facing out, so the next
 * cycle starts from `e = 0` with the colours exchanged and nothing jumps.
 *
 * ## The jelly
 *
 * Four damped springs, all driven by the pointer: the follower position (lag),
 * a signed stretch along the direction of travel (squash and stretch; it
 * overshoots through zero into a squash when the pointer stops), a click squish,
 * and a wobble that ripples the surface radially. `jelly` lowers their damping
 * ratio, which is all "jelliness" is.
 *
 * ## Ownership
 *
 * This module owns no loop and no listener. `components/globe-cursor/GlobeCursor.tsx`
 * feeds it pointer events, calls `step` + `draw` from its frame, and asks
 * `busy()` whether anything is still moving so the frame can stop.
 */

import { evert, stageParams } from '@/lib/eversion/thurston';
import { GlobeGl } from './gl';
import { BASE_EVERT_SECONDS, type CursorDetail, type GlobeCursorSettings } from './settings';

const PI = Math.PI;
const TWO_PI = PI * 2;
const DEG = PI / 180;
/** Largest |F| of the eversion (MAX_EVERSION_EXTENT) — sizes the offscreen sprite. */
const EXTENT = 1.35;
const MAX_PARTICLES = 160;
/** Seconds between trail echoes. Time, not frames, so the trail is the same length at 30 Hz and 144 Hz. */
const TRAIL_SPACING = 0.05;

/** CPU fallback grid (no WebGL 2). The GPU path's own, much finer grid is in `gl.ts`. */
const GRID: Record<CursorDetail, [number, number]> = {
  low: [24, 12],
  medium: [40, 20],
  high: [56, 28],
};

export type HoverKind = 'none' | 'interactive' | 'text';

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** HSL (deg, %, %) → linear 0–1 RGB. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Advance a damped spring toward `target` by `dt`. Returns `[position, velocity]`.
 *
 * Semi-implicit Euler is only stable while ω·dt < 2, and the stiff follower
 * (ω ≈ 60) breaks that on any frame slower than ~33 ms — the globe then flies to
 * infinity and never comes back. So the step is split into substeps of ω·dt ≤ 0.25.
 */
function spring(
  x: number,
  v: number,
  target: number,
  omega: number,
  zeta: number,
  dt: number,
): [number, number] {
  const n = Math.max(1, Math.ceil((omega * dt) / 0.25));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    v += (omega * omega * (target - x) - 2 * zeta * omega * v) * h;
    x += v * h;
  }
  return [x, v];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
}

export class GlobeCursorEngine {
  private s: GlobeCursorSettings;
  private reduced = false;

  // Pointer + follower (CSS px).
  private tx = -1e4;
  private ty = -1e4;
  private x = -1e4;
  private y = -1e4;
  private vx = 0;
  private vy = 0;
  private pvx = 0;
  private pvy = 0;
  private placed = false;

  // Springs.
  private stretch = 0;
  private stretchV = 0;
  private dirX = 1;
  private dirY = 0;
  private squish = 0;
  private squishV = 0;
  private wobble = 0;
  private wobbleV = 0;
  private scale = 1;
  private scaleV = 0;
  private alpha = 0;

  private pressed = false;
  private visible = false;
  private hover: HoverKind = 'none';

  // Eversion clock + orientation (row-major 3×3).
  private tau = 0;
  private time = 0;
  private rot = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private rotScratch = new Float64Array(9);
  private orthoCounter = 0;

  // Mesh scratch.
  private nT = 0;
  private nP = 0;
  private pos = new Float64Array(0);
  private order: number[] = [];
  private depth = new Float64Array(0);
  private quadNx = new Float64Array(0);
  private quadNy = new Float64Array(0);
  private quadNz = new Float64Array(0);
  private orientSign = 1;
  private tmp = new Float64Array(3);

  // Colour.
  private outsideHsl: Hsl;
  private insideHsl: Hsl;
  private glowHsl: Hsl | null;

  // Effects.
  private particles: Particle[] = [];
  /** Follower history, newest first, stamped with `time`. */
  private trail: { x: number; y: number; t: number }[] = [];

  // Sprite.
  private sprite: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private spriteCss = 0;
  private spriteSource: CanvasImageSource;
  private dpr = 1;
  private gpu: GlobeGl | null;
  private stage = new Float64Array(8);
  private model = new Float64Array(9);
  private deform = new Float64Array(9);
  private deformIT = new Float64Array(9);

  constructor(settings: GlobeCursorSettings) {
    this.s = settings;
    this.outsideHsl = hexToHsl(settings.outside);
    this.insideHsl = hexToHsl(settings.inside);
    this.glowHsl = settings.glowColor ? hexToHsl(settings.glowColor) : null;
    this.sprite = document.createElement('canvas');
    const ctx = this.sprite.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.sctx = ctx;
    this.spriteSource = this.sprite;
    this.gpu = GlobeGl.create();
    this.buildMesh();
  }

  dispose(): void {
    this.gpu?.dispose();
    this.gpu = null;
  }

  setSettings(settings: GlobeCursorSettings): void {
    const detailChanged = settings.detail !== this.s.detail;
    this.s = settings;
    this.outsideHsl = hexToHsl(settings.outside);
    this.insideHsl = hexToHsl(settings.inside);
    this.glowHsl = settings.glowColor ? hexToHsl(settings.glowColor) : null;
    if (detailChanged) this.buildMesh();
    if (settings.trail === 0) this.trail.length = 0;
    if (!settings.sparkles) this.particles.length = 0;
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) {
      this.particles.length = 0;
      this.trail.length = 0;
    }
  }

  setDpr(dpr: number): void {
    this.dpr = dpr;
  }

  /* ── Input ─────────────────────────────────────────────────────────────── */

  move(x: number, y: number): void {
    this.tx = x;
    this.ty = y;
    if (!this.placed || this.reduced) {
      this.x = x;
      this.y = y;
      this.placed = true;
    }
    this.visible = true;
  }

  leave(): void {
    this.visible = false;
  }

  setHover(kind: HoverKind): void {
    this.hover = kind;
  }

  down(): void {
    this.pressed = true;
    if (this.reduced) return;
    this.wobbleV += 6 * (0.3 + this.s.jelly);
    if (this.s.sparkles) this.burst(this.tx, this.ty, 14, 260);
  }

  up(): void {
    this.pressed = false;
  }

  /** True while anything is still visibly changing — the caller stops its frame when this is false. */
  busy(): boolean {
    return this.visible || this.alpha > 0.01 || this.particles.length > 0 || this.trail.length > 0;
  }

  /* ── Simulation ────────────────────────────────────────────────────────── */

  step(dtRaw: number): void {
    // Real time up to 100 ms a frame, so a slow machine sees the same motion at a lower frame rate rather than
    // slow motion (the springs substep, so a long step is stable); beyond that, e.g. returning to a hidden tab, it
    // is capped so nothing jumps.
    const dt = Math.min(dtRaw, 0.1);
    const s = this.s;
    const j = s.jelly;
    this.time += dt;

    // Fade in/out.
    this.alpha += ((this.visible ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt * 14));

    if (this.reduced) {
      this.x = this.tx;
      this.y = this.ty;
      this.vx = this.vy = 0;
      this.stretch = this.squish = this.wobble = 0;
      this.scale = this.hoverTarget();
      return;
    }

    // Follower: glued at lag 0, an under-damped spring otherwise.
    const px = this.x;
    const py = this.y;
    if (s.lag <= 0.001) {
      this.x = this.tx;
      this.y = this.ty;
    } else {
      const omega = lerp(70, 7, s.lag);
      const zeta = lerp(1, 0.45, j);
      [this.x, this.vx] = spring(this.x, this.vx, this.tx, omega, zeta, dt);
      [this.y, this.vy] = spring(this.y, this.vy, this.ty, omega, zeta, dt);
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
        this.x = this.tx;
        this.y = this.ty;
        this.vx = this.vy = 0;
      }
    }
    const mvx = (this.x - px) / Math.max(dt, 1e-4);
    const mvy = (this.y - py) / Math.max(dt, 1e-4);
    const speed = Math.hypot(mvx, mvy);
    const accel = Math.hypot(mvx - this.pvx, mvy - this.pvy) * dt;
    this.pvx = mvx;
    this.pvy = mvy;

    // Squash & stretch along the direction of travel.
    if (speed > 40) {
      const k = 1 - Math.exp(-dt * 18);
      this.dirX += (mvx / speed - this.dirX) * k;
      this.dirY += (mvy / speed - this.dirY) * k;
      const len = Math.hypot(this.dirX, this.dirY) || 1;
      this.dirX /= len;
      this.dirY /= len;
    }
    const stretchTarget = clamp(speed / 1600, 0, 0.7) * j * 1.1;
    [this.stretch, this.stretchV] = spring(
      this.stretch,
      this.stretchV,
      stretchTarget,
      lerp(32, 11, j),
      lerp(0.95, 0.16, j),
      dt,
    );
    this.stretch = clamp(this.stretch, -0.45, 0.9);

    // Click squish.
    const squishTarget = this.pressed && s.clickSquish ? 0.18 + 0.14 * j : 0;
    [this.squish, this.squishV] = spring(
      this.squish,
      this.squishV,
      squishTarget,
      20,
      lerp(0.85, 0.2, j),
      dt,
    );
    this.squish = clamp(this.squish, -0.35, 0.45);

    // Surface wobble, kicked by acceleration.
    this.wobbleV += Math.min(accel / 60, 4) * j;
    [this.wobble, this.wobbleV] = spring(this.wobble, this.wobbleV, 0, 13, lerp(0.6, 0.07, j), dt);
    this.wobble = clamp(this.wobble, -1, 1);

    // Hover scale.
    [this.scale, this.scaleV] = spring(
      this.scale,
      this.scaleV,
      this.hoverTarget(),
      18,
      lerp(0.9, 0.35, j),
      dt,
    );

    // Eversion clock.
    const boost = 1 + s.motionBoost * Math.min(speed / 700, 3);
    this.tau += (dt * s.speed * boost) / BASE_EVERT_SECONDS;

    // Orientation: spin about the screen vertical, then roll with travel.
    this.rotate(0, 1, 0, s.spin * DEG * dt);
    if (s.roll && speed > 1) {
      const r = (s.size / 2) * this.scale;
      this.rotate(-mvy / speed, mvx / speed, 0, (speed * dt) / r);
    }

    // Trail history.
    if (s.trail > 0) {
      this.trail.unshift({ x: this.x, y: this.y, t: this.time });
      // Keep one entry past the oldest echo, so that echo always has a sample at or before its time.
      const horizon = this.time - s.trail * TRAIL_SPACING;
      let keep = this.trail.findIndex((p) => p.t <= horizon);
      keep = keep < 0 ? this.trail.length : keep + 1;
      this.trail.length = keep;
      if (!this.visible && this.alpha < 0.02) this.trail.length = 0;
    }

    // Sparkles.
    if (s.sparkles && this.visible) {
      const emit = (Math.hypot(this.x - px, this.y - py) / 9) * (0.5 + Math.random());
      for (let i = 0; i < Math.floor(emit); i++) this.burst(this.x, this.y, 1, 60);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 140 * dt;
      p.vx *= 1 - dt * 1.8;
      p.vy *= 1 - dt * 1.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private hoverTarget(): number {
    if (this.hover === 'interactive') return this.s.hoverGrow;
    if (this.hover === 'text' && this.s.nativeOverText) return 0.5;
    return 1;
  }

  private burst(x: number, y: number, n: number, power: number): void {
    const base = this.currentHue();
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * TWO_PI;
      const v = power * (0.3 + Math.random());
      const max = 0.4 + Math.random() * 0.6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: max,
        max,
        hue: this.s.palette === 'rainbow' ? Math.random() * 360 : base + (Math.random() - 0.5) * 50,
        size: 1 + Math.random() * 2.2,
      });
    }
  }

  /** Left-multiply the orientation by a rotation of `angle` about (ax, ay, az). */
  private rotate(ax: number, ay: number, az: number, angle: number): void {
    if (angle === 0) return;
    const len = Math.hypot(ax, ay, az);
    if (len < 1e-9) return;
    ax /= len;
    ay /= len;
    az /= len;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const t = 1 - c;
    const r00 = t * ax * ax + c;
    const r01 = t * ax * ay - sn * az;
    const r02 = t * ax * az + sn * ay;
    const r10 = t * ax * ay + sn * az;
    const r11 = t * ay * ay + c;
    const r12 = t * ay * az - sn * ax;
    const r20 = t * ax * az - sn * ay;
    const r21 = t * ay * az + sn * ax;
    const r22 = t * az * az + c;
    const m = this.rot;
    const out = this.rotScratch;
    for (let col = 0; col < 3; col++) {
      const a = m[col]!;
      const b = m[3 + col]!;
      const d = m[6 + col]!;
      out[col] = r00 * a + r01 * b + r02 * d;
      out[3 + col] = r10 * a + r11 * b + r12 * d;
      out[6 + col] = r20 * a + r21 * b + r22 * d;
    }
    this.rotScratch = m;
    this.rot = out;
    if (++this.orthoCounter > 120) {
      this.orthoCounter = 0;
      this.orthonormalize();
    }
  }

  private orthonormalize(): void {
    const m = this.rot;
    let [a0, a1, a2, b0, b1, b2] = [m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!];
    let l = Math.hypot(a0, a1, a2) || 1;
    a0 /= l;
    a1 /= l;
    a2 /= l;
    const d = a0 * b0 + a1 * b1 + a2 * b2;
    b0 -= d * a0;
    b1 -= d * a1;
    b2 -= d * a2;
    l = Math.hypot(b0, b1, b2) || 1;
    b0 /= l;
    b1 /= l;
    b2 /= l;
    m.set([a0, a1, a2, b0, b1, b2, a1 * b2 - a2 * b1, a2 * b0 - a0 * b2, a0 * b1 - a1 * b0]);
  }

  /** Eversion progress and whether the colours are swapped this cycle. */
  private progress(): { e: number; flipped: boolean } {
    if (this.reduced) return { e: 0.42, flipped: false };
    const { mode, dwell } = this.s;
    const hold = (f: number) => smooth(clamp((f - dwell / 2) / Math.max(1 - dwell, 1e-3), 0, 1));
    if (mode === 'pingpong') {
      const f = this.tau % 2;
      return { e: hold(f < 1 ? f : 2 - f), flipped: false };
    }
    if (mode === 'breathe') {
      const f = this.tau % 1;
      return { e: 0.62 * (0.5 - 0.5 * Math.cos(TWO_PI * hold(f))), flipped: false };
    }
    const cycle = Math.floor(this.tau);
    return { e: hold(this.tau - cycle), flipped: cycle % 2 === 1 };
  }

  private currentHue(): number {
    return (this.outsideHsl.h + this.time * this.s.hueDrift) % 360;
  }

  /* ── Mesh ──────────────────────────────────────────────────────────────── */

  private buildMesh(): void {
    const [nT, nP] = GRID[this.s.detail];
    this.nT = nT;
    this.nP = nP;
    this.pos = new Float64Array((nT + 1) * (nP + 1) * 3);
    const quads = nT * nP;
    this.order = Array.from({ length: quads }, (_, i) => i);
    this.depth = new Float64Array(quads);
    this.quadNx = new Float64Array(quads);
    this.quadNy = new Float64Array(quads);
    this.quadNz = new Float64Array(quads);
    // Which winding is "outward": measured once on the round sphere at the front quad.
    this.sample(0);
    const q = (nP >> 1) * nT + (nT >> 1);
    this.quadNormal(q);
    const c = this.quadCentre(q);
    this.orientSign =
      this.quadNx[q]! * c[0] + this.quadNy[q]! * c[1] + this.quadNz[q]! * c[2] >= 0 ? 1 : -1;
  }

  /** Evaluate the eversion at progress `e` into the body-space grid. */
  private sample(e: number): void {
    const { nT, nP, pos, tmp } = this;
    for (let jj = 0; jj <= nP; jj++) {
      // Keep off the exact poles; the polar fan is degenerate and the frame is cached per latitude.
      const phi = clamp(-PI / 2 + (PI * jj) / nP, -PI / 2 + 1e-4, PI / 2 - 1e-4);
      for (let ii = 0; ii <= nT; ii++) {
        const theta = -PI + (TWO_PI * ii) / nT;
        evert(theta, phi, e, tmp);
        const o = (jj * (nT + 1) + ii) * 3;
        pos[o] = tmp[0]!;
        pos[o + 1] = tmp[1]!;
        pos[o + 2] = tmp[2]!;
      }
    }
  }

  private vi(ii: number, jj: number): number {
    return (jj * (this.nT + 1) + ii) * 3;
  }

  private quadCentre(q: number): [number, number, number] {
    const ii = q % this.nT;
    const jj = Math.floor(q / this.nT);
    const p = this.pos;
    const a = this.vi(ii, jj);
    const b = this.vi(ii + 1, jj);
    const c = this.vi(ii + 1, jj + 1);
    const d = this.vi(ii, jj + 1);
    return [
      (p[a]! + p[b]! + p[c]! + p[d]!) / 4,
      (p[a + 1]! + p[b + 1]! + p[c + 1]! + p[d + 1]!) / 4,
      (p[a + 2]! + p[b + 2]! + p[c + 2]! + p[d + 2]!) / 4,
    ];
  }

  /** Normal of quad `q` from its diagonals (robust where one edge collapses at a pole). */
  private quadNormal(q: number): void {
    const ii = q % this.nT;
    const jj = Math.floor(q / this.nT);
    const p = this.pos;
    const a = this.vi(ii, jj);
    const b = this.vi(ii + 1, jj);
    const c = this.vi(ii + 1, jj + 1);
    const d = this.vi(ii, jj + 1);
    const ux = p[c]! - p[a]!;
    const uy = p[c + 1]! - p[a + 1]!;
    const uz = p[c + 2]! - p[a + 2]!;
    const vx = p[d]! - p[b]!;
    const vy = p[d + 1]! - p[b + 1]!;
    const vz = p[d + 2]! - p[b + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.quadNx[q] = nx;
    this.quadNy[q] = ny;
    this.quadNz[q] = nz;
  }

  /* ── Drawing ───────────────────────────────────────────────────────────── */

  /** Paint the globe into the sprite. Returns the sprite's CSS size. */
  private paintSprite(): number {
    const s = this.s;
    const { nT, nP, pos } = this;
    const R = s.size / 2;
    const scale = this.scale;
    const stretch = this.stretch;
    const squish = this.squish;

    // Fixed per settings (room for hover growth and a full stretch), so animation never reallocates the sprite.
    const css = Math.ceil((R * EXTENT * Math.max(1, s.hoverGrow) * 2 + 4) * 2);
    const px = Math.ceil(css * this.dpr);
    this.spriteCss = css;

    const { e, flipped } = this.progress();

    // Orientation: spin/roll matrix, then the fixed tilt about screen x.
    const m = this.rot;
    const ct = Math.cos(s.tilt * DEG);
    const st = Math.sin(s.tilt * DEG);
    const dX = this.dirX;
    const dY = this.dirY;
    const along = 1 + stretch;
    const across = 1 / Math.sqrt(Math.max(0.3, along));
    const sqY = 1 - squish;
    const sqX = 1 / Math.sqrt(Math.max(0.3, sqY));
    const wob = this.wobble * 0.13;
    const tw = this.time * 7;

    if (this.gpu?.ok) {
      this.spriteSource = this.paintGpu(px, css, e, flipped, {
        dX,
        dY,
        along,
        across,
        sqX,
        sqY,
        ct,
        st,
      });
      return css;
    }
    this.spriteSource = this.sprite;

    if (this.sprite.width !== px) {
      this.sprite.width = px;
      this.sprite.height = px;
    }
    const ctx = this.sctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, (css / 2) * this.dpr, (css / 2) * this.dpr);
    this.sample(e);

    for (let jj = 0; jj <= nP; jj++) {
      const phi = -PI / 2 + (PI * jj) / nP;
      for (let ii = 0; ii <= nT; ii++) {
        const o = (jj * (nT + 1) + ii) * 3;
        let x = pos[o]!;
        let y = pos[o + 1]!;
        let z = pos[o + 2]!;
        if (wob !== 0) {
          const theta = -PI + (TWO_PI * ii) / nT;
          const k = 1 + wob * Math.sin(3 * theta + 2 * phi + tw);
          x *= k;
          y *= k;
          z *= k;
        }
        // Rotate.
        const rx = m[0]! * x + m[1]! * y + m[2]! * z;
        const ry0 = m[3]! * x + m[4]! * y + m[5]! * z;
        const rz0 = m[6]! * x + m[7]! * y + m[8]! * z;
        const ry = ct * ry0 - st * rz0;
        let rz = st * ry0 + ct * rz0;
        // Squash & stretch in the screen plane, volume-preserving-ish.
        const a = rx * dX + ry * dY;
        let sx = dX * a * along + (rx - dX * a) * across;
        let sy = dY * a * along + (ry - dY * a) * across;
        rz *= across;
        sx *= sqX;
        sy *= sqY;
        rz *= sqX;
        pos[o] = sx * R * scale;
        pos[o + 1] = sy * R * scale;
        pos[o + 2] = rz * R * scale;
      }
    }

    const quads = nT * nP;
    for (let q = 0; q < quads; q++) {
      this.quadNormal(q);
      const ii = q % nT;
      const jj = Math.floor(q / nT);
      this.depth[q] =
        pos[this.vi(ii, jj) + 2]! +
        pos[this.vi(ii + 1, jj) + 2]! +
        pos[this.vi(ii + 1, jj + 1) + 2]! +
        pos[this.vi(ii, jj + 1) + 2]!;
    }
    const depth = this.depth;
    this.order.sort((a, b) => depth[a]! - depth[b]!);

    // Light from the upper left, toward the viewer (y is down).
    const Lx = -0.45;
    const Ly = -0.65;
    const Lz = 0.62;
    const Hl = Math.hypot(Lx, Ly, Lz + 1);
    const Hx = Lx / Hl;
    const Hy = Ly / Hl;
    const Hz = (Lz + 1) / Hl;

    const hueShift = this.time * s.hueDrift;
    const vib = s.vibrance;
    const out = flipped ? this.insideHsl : this.outsideHsl;
    const inn = flipped ? this.outsideHsl : this.insideHsl;
    const style = s.style;
    const fillAlpha = style === 'glass' ? 0.38 : 1;
    ctx.lineJoin = 'round';

    for (const q of this.order) {
      const ii = q % nT;
      const jj = Math.floor(q / nT);
      let nx = this.quadNx[q]! * this.orientSign;
      let ny = this.quadNy[q]! * this.orientSign;
      let nz = this.quadNz[q]! * this.orientSign;
      const outsideVisible = nz >= 0;
      if (!outsideVisible) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const diffuse = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const spec = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 28) * s.shine;
      const rim = (1 - nz) * (1 - nz);

      let base: Hsl;
      const strip = Math.floor((ii * 8) / nT);
      switch (s.palette) {
        case 'rainbow': {
          const h = (strip * 45 + (jj / nP) * 30) % 360;
          base = { h, s: 85, l: outsideVisible ? 58 : 36 };
          break;
        }
        case 'checker': {
          const band = Math.floor((jj * 6) / nP);
          const odd = (strip + band) % 2 === 1;
          base = odd !== outsideVisible ? out : inn;
          break;
        }
        case 'aurora': {
          const t = jj / nP;
          const from = outsideVisible ? out : inn;
          const to = outsideVisible ? inn : out;
          let dh = to.h - from.h;
          if (dh > 180) dh -= 360;
          if (dh < -180) dh += 360;
          base = { h: from.h + dh * t, s: lerp(from.s, to.s, t), l: lerp(from.l, to.l, t) };
          break;
        }
        default:
          base = outsideVisible ? out : inn;
      }

      const h = (((base.h + hueShift) % 360) + 360) % 360;
      const sat = clamp(base.s * vib, 0, 100);
      const light = clamp(base.l * (0.32 + 0.78 * diffuse) + spec * 45 + rim * s.glow * 14, 4, 97);
      const color = `hsl(${h.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%`;

      const a = this.vi(ii, jj);
      const b = this.vi(ii + 1, jj);
      const c = this.vi(ii + 1, jj + 1);
      const d = this.vi(ii, jj + 1);

      if (style === 'dots') {
        const r = Math.max(0.6, R * 0.045 * (0.6 + nz));
        ctx.fillStyle = `${color} / ${(0.55 + 0.45 * nz).toFixed(2)})`;
        ctx.fillRect(pos[a]! - r, pos[a + 1]! - r, r * 2, r * 2);
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(pos[a]!, pos[a + 1]!);
      ctx.lineTo(pos[b]!, pos[b + 1]!);
      ctx.lineTo(pos[c]!, pos[c + 1]!);
      ctx.lineTo(pos[d]!, pos[d + 1]!);
      ctx.closePath();

      if (style === 'wire') {
        ctx.strokeStyle = `${color} / ${(0.35 + 0.65 * nz).toFixed(2)})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = `${color} / ${fillAlpha})`;
      ctx.fill();
      if (style === 'glass') {
        ctx.strokeStyle = `hsl(${h.toFixed(1)} ${sat.toFixed(1)}% ${Math.min(97, light + 18).toFixed(1)}% / 0.55)`;
        ctx.lineWidth = 0.6;
      } else {
        // Seal the hairline seams between neighbouring quads.
        ctx.strokeStyle = `${color} / 1)`;
        ctx.lineWidth = 0.5;
      }
      ctx.stroke();
    }
    return css;
  }

  /** The GPU path: same transforms as the CPU loop above, handed to the shader as matrices. */
  private paintGpu(
    px: number,
    css: number,
    e: number,
    flipped: boolean,
    k: {
      dX: number;
      dY: number;
      along: number;
      across: number;
      sqX: number;
      sqY: number;
      ct: number;
      st: number;
    },
  ): CanvasImageSource {
    const s = this.s;
    const gpu = this.gpu!;
    stageParams(e, this.stage);

    // model = Rx(tilt) · orientation
    const m = this.rot;
    const M = this.model;
    for (let c = 0; c < 3; c++) {
      M[c] = m[c]!;
      M[3 + c] = k.ct * m[3 + c]! - k.st * m[6 + c]!;
      M[6 + c] = k.st * m[3 + c]! + k.ct * m[6 + c]!;
    }

    // deform = squish · (across·I + (along − across)·d dᵀ in the screen plane; across in depth)
    const g = k.along - k.across;
    const a = k.sqX * (k.across + g * k.dX * k.dX);
    const b = k.sqX * g * k.dX * k.dY;
    const c = k.sqY * g * k.dX * k.dY;
    const d = k.sqY * (k.across + g * k.dY * k.dY);
    const zz = k.sqX * k.across;
    this.deform.set([a, b, 0, c, d, 0, 0, 0, zz]);
    const det = a * d - b * c || 1e-6;
    this.deformIT.set([d / det, -c / det, 0, -b / det, a / det, 0, 0, 0, 1 / zz]);

    const hueShift = this.time * s.hueDrift;
    const hue = (h: Hsl) => (((h.h + hueShift) % 360) + 360) % 360;
    const sat = (h: Hsl) => clamp(h.s * s.vibrance, 0, 100);
    const hsl = (h: Hsl): [number, number, number] => [hue(h), sat(h) / 100, h.l / 100];
    const colour = (h: Hsl) => hslToRgb(hue(h), sat(h), clamp(h.l + 8, 30, 80));
    const out = flipped ? this.insideHsl : this.outsideHsl;
    const inn = flipped ? this.outsideHsl : this.insideHsl;

    return gpu.render({
      px,
      detail: s.detail,
      stage: this.stage,
      model: M,
      deform: this.deform,
      deformIT: this.deformIT,
      scale: ((s.size / 2) * this.scale) / (css / 2),
      wobble: this.wobble * 0.13,
      time: this.time,
      pointPx: Math.max(1.5, s.size * this.scale * 0.075 * this.dpr),
      palette: s.palette,
      style: s.style,
      outside: hsl(out),
      inside: hsl(inn),
      glowRgb: colour(this.glowHsl ?? out),
      hueShift,
      vibrance: s.vibrance,
      shine: s.shine,
      glow: s.glow,
    });
  }

  private glowCss(alpha: number): string {
    const g = this.glowHsl ?? (this.progress().flipped ? this.insideHsl : this.outsideHsl);
    const h = (((g.h + this.time * this.s.hueDrift) % 360) + 360) % 360;
    const sat = clamp(g.s * Math.max(this.s.vibrance, 0.2), 0, 100);
    return `hsl(${h.toFixed(1)} ${sat.toFixed(1)}% ${clamp(g.l + 8, 30, 80).toFixed(1)}% / ${alpha.toFixed(3)})`;
  }

  private bx0 = 0;
  private by0 = 0;
  private bx1 = 0;
  private by1 = 0;

  /** Extend this frame's painted bounds by a disc at (x, y). */
  private grow(x: number, y: number, r: number): void {
    this.bx0 = Math.min(this.bx0, x - r);
    this.by0 = Math.min(this.by0, y - r);
    this.bx1 = Math.max(this.bx1, x + r);
    this.by1 = Math.max(this.by1, y + r);
  }

  /**
   * Draw one frame onto the overlay context (identity transform, device px).
   * Returns what it painted, in CSS px, so the caller clears only that region
   * next frame instead of the whole viewport — or null if nothing was painted.
   */
  draw(ctx: CanvasRenderingContext2D): { x: number; y: number; w: number; h: number } | null {
    const s = this.s;
    const dpr = this.dpr;
    const alpha = this.alpha * s.opacity;
    this.bx0 = this.by0 = Infinity;
    this.bx1 = this.by1 = -Infinity;
    if (alpha < 0.005 && this.particles.length === 0) return null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = this.paintSprite();
    const half = css / 2;
    const textMode = this.hover === 'text' && s.nativeOverText && s.hideNative;
    const ox = textMode ? 16 : 0;
    const oy = textMode ? 16 : 0;
    const R = (s.size / 2) * this.scale;

    // Sparkles.
    if (this.particles.length) {
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const t = p.life / p.max;
        ctx.fillStyle = `hsl(${p.hue.toFixed(0)} ${clamp(90 * s.vibrance, 0, 100).toFixed(0)}% 65% / ${(t * 0.9).toFixed(2)})`;
        const r = p.size * (0.4 + t);
        this.grow(p.x, p.y, r + 1);
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = prev;
    }

    if (alpha < 0.005) return this.bounds();

    // Trail echoes: the current sprite redrawn at past positions, fading and shrinking.
    if (s.trail > 0) {
      for (let k = s.trail; k >= 1; k--) {
        const at = this.time - k * TRAIL_SPACING;
        const p = this.trail.find((e) => e.t <= at) ?? this.trail[this.trail.length - 1];
        if (!p) continue;
        const t = 1 - k / (s.trail + 1);
        const sc = 0.45 + 0.55 * t;
        ctx.globalAlpha = alpha * t * 0.45;
        this.grow(p.x + ox, p.y + oy, half * sc + 1);
        ctx.drawImage(
          this.spriteSource,
          p.x + ox - half * sc,
          p.y + oy - half * sc,
          css * sc,
          css * sc,
        );
      }
    }

    // Halo.
    if (s.glow > 0) {
      const gr = R * (1.6 + s.glow * 1.6);
      const g = ctx.createRadialGradient(
        this.x + ox,
        this.y + oy,
        R * 0.4,
        this.x + ox,
        this.y + oy,
        gr,
      );
      g.addColorStop(0, this.glowCss(0.38 * s.glow * alpha));
      g.addColorStop(1, this.glowCss(0));
      ctx.globalAlpha = 1;
      this.grow(this.x + ox, this.y + oy, gr + 1);
      ctx.fillStyle = g;
      ctx.fillRect(this.x + ox - gr, this.y + oy - gr, gr * 2, gr * 2);
    }

    // The globe, with its silhouette glow.
    ctx.globalAlpha = textMode ? alpha * 0.75 : alpha;
    if (s.glow > 0) {
      ctx.shadowColor = this.glowCss(Math.min(1, 0.4 + s.glow * 0.6));
      ctx.shadowBlur = s.glow * R * 1.1 * dpr;
    }
    // The sprite's square plus twice the shadow blur, which spreads past the silhouette.
    this.grow(this.x + ox, this.y + oy, half * Math.SQRT2 + s.glow * R * 2.2 + 2);
    ctx.drawImage(this.spriteSource, this.x + ox - half, this.y + oy - half, css, css);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Hotspot: always exactly at the pointer, whatever the lag.
    if (s.hotspot && !textMode) {
      ctx.globalAlpha = this.alpha;
      this.grow(this.tx, this.ty, 4);
      ctx.beginPath();
      ctx.arc(this.tx, this.ty, 2.6, 0, TWO_PI);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.tx, this.ty, 1.6, 0, TWO_PI);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return this.bounds();
  }

  private bounds(): { x: number; y: number; w: number; h: number } | null {
    if (!(this.bx1 > this.bx0)) return null;
    return { x: this.bx0, y: this.by0, w: this.bx1 - this.bx0, h: this.by1 - this.by0 };
  }
}
