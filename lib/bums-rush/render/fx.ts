/**
 * Layer 4 — the effects. Pooled, capped, and allocation-free.
 *
 * Ink splats, torn-paper confetti, speed scribbles and dust. Two hard caps from
 * §17: `RENDER.MAX_PARTICLES` live particles and `RENDER.MAX_SPLATS` retained
 * death blots. Both are enforced here rather than trusted to the callers,
 * because the callers are gameplay events and gameplay events arrive in bursts.
 *
 * The pool is struct-of-arrays over `Float32Array`s, and `update`/`draw`
 * allocate nothing at all — no closures, no vectors, no option literals, no
 * colour strings. That is not stylistic: a GC pause in a physics game reads to
 * the player as input lag, and this is the only per-frame system whose object
 * count scales with how exciting the moment is.
 *
 * Death splats are *not* pooled here — they live on `RenderState.splats`,
 * because they are simulation state (they persist for the whole attempt, and a
 * joining client must see the same ones). This file only knows how to draw
 * them, and enforces the retention cap by fading the oldest.
 */

import { RENDER } from '../constants';
import type { GameEvent, Rect, RenderState, SeatIndex, Vec2 } from '../types';
import type { BoilField } from './boil';
import { inkBlob, inkStroke, type StrokeOptions } from './ink';
import { mixColor, withAlpha, type BumPalette } from './theme';

const KIND_CONFETTI = 0;
const KIND_SCRIBBLE = 1;
const KIND_DUST = 2;
const KIND_FLASH = 3;

const MAX = RENDER.MAX_PARTICLES;

/** Six hand-drawn blots (§2.7), each 14 radii. Generated once, never per splat. */
const SPLAT_SHAPES = 6;
const SPLAT_POINTS = 14;
/** Blot radius in design px — a splat is roughly a head. */
const SPLAT_SCALE = 26;
const SPLAT_RADII = new Float32Array(SPLAT_SHAPES * SPLAT_POINTS);
/** One view per shape, made once — `subarray` in the draw loop is an allocation. */
const SPLAT_VIEWS: Float32Array[] = [];

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

{
  // A blot is a circle with a few long fingers where the ink ran. Built at
  // module load so the six shapes are identical on every client — a splat is
  // part of what a player recognises about a level they have failed six times.
  const random = seededRandom(0xb10b5);
  for (let s = 0; s < SPLAT_SHAPES; s++) {
    for (let i = 0; i < SPLAT_POINTS; i++) {
      const finger = random() < 0.22 ? 0.55 + random() * 0.7 : 0;
      SPLAT_RADII[s * SPLAT_POINTS + i] = 0.78 + random() * 0.24 + finger;
    }
    SPLAT_VIEWS.push(SPLAT_RADII.subarray(s * SPLAT_POINTS, (s + 1) * SPLAT_POINTS));
  }
}

/**
 * A single mutable options object, reused for every particle stroke. The colour
 * is a placeholder that is overwritten from the palette before any draw — no
 * literal in this pipeline ever reaches a canvas.
 */
const STROKE: StrokeOptions = { width: 2, color: '', graphite: false };

export class FxSystem {
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly rot = new Float32Array(MAX);
  private readonly vrot = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX);
  private readonly seat = new Uint8Array(MAX);
  /** Points of the scribble tail, three per particle. */
  private readonly tailX = new Float64Array(3);
  private readonly tailY = new Float64Array(3);

  private live = 0;
  private cap: number = MAX;
  private readonly random: () => number;

  /** Colours resolved once per palette change, never per particle. */
  private confettiColor = '';
  private confettiEdge = '';
  private scribbleColor = '';
  private dustColor = '';
  private flashColor = '';
  private readonly splatColors: string[] = ['', '', '', ''];
  private paletteRef: BumPalette | null = null;

  constructor(seed = 0xfeed) {
    this.random = seededRandom(seed);
  }

  get active(): number {
    return this.live;
  }

  /** Degradation ladder rung 2 (§17): halve the particle cap. */
  setCap(cap: number): void {
    this.cap = Math.max(0, Math.min(MAX, Math.floor(cap)));
    if (this.live > this.cap) this.live = this.cap;
  }

  setPalette(palette: BumPalette): void {
    if (this.paletteRef === palette) return;
    this.paletteRef = palette;
    this.confettiColor = palette.paper2;
    this.confettiEdge = withAlpha(palette.ink, 0.45);
    this.scribbleColor = palette.inkSoft;
    this.dustColor = withAlpha(palette.graphite, 0.5);
    this.flashColor = withAlpha(palette.highlight, 0.8);
    for (let i = 0; i < 4; i++) {
      // Tinted toward the seat's pen so a wall of failures says *whose*.
      this.splatColors[i] = mixColor(palette.splat, palette.seat[i], 0.35);
    }
  }

  clear(): void {
    this.live = 0;
  }

  /** Claim a slot, or -1 when the pool is full. Oldest-wins is deliberately NOT
   * the policy: overwriting a live splash to show a new one makes bursts flicker.
   */
  private spawn(): number {
    if (this.live >= this.cap) return -1;
    return this.live++;
  }

  private set(
    i: number,
    kind: number,
    px: number,
    py: number,
    pvx: number,
    pvy: number,
    lifeMs: number,
    sizePx: number,
    seatIndex: number,
  ): void {
    this.kind[i] = kind;
    this.x[i] = px;
    this.y[i] = py;
    this.vx[i] = pvx;
    this.vy[i] = pvy;
    this.life[i] = lifeMs;
    this.maxLife[i] = lifeMs;
    this.size[i] = sizePx;
    this.seat[i] = seatIndex & 3;
    this.rot[i] = this.random() * Math.PI * 2;
    this.vrot[i] = (this.random() - 0.5) * 0.02;
  }

  /** Torn-paper confetti — impacts, checkpoints, the finish. */
  burstConfetti(px: number, py: number, count: number, seatIndex = 0): void {
    for (let n = 0; n < count; n++) {
      const i = this.spawn();
      if (i < 0) return;
      const a = this.random() * Math.PI * 2;
      const speed = 0.12 + this.random() * 0.32;
      this.set(
        i,
        KIND_CONFETTI,
        px,
        py,
        Math.cos(a) * speed,
        Math.sin(a) * speed - 0.15,
        700 + this.random() * 500,
        5 + this.random() * 6,
        seatIndex,
      );
    }
  }

  /** The four torn-paper bits of a survivable impact (§2.7). */
  burstDust(px: number, py: number, count = 4): void {
    for (let n = 0; n < count; n++) {
      const i = this.spawn();
      if (i < 0) return;
      const a = -Math.PI * 0.25 - this.random() * Math.PI * 0.5;
      const speed = 0.08 + this.random() * 0.18;
      this.set(
        i,
        KIND_DUST,
        px,
        py,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        380 + this.random() * 220,
        3 + this.random() * 4,
        0,
      );
    }
  }

  /** Three speed-scribble strokes trailing a head for 200ms (§2.7). */
  scribble(px: number, py: number, dirX: number, dirY: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    for (let n = 0; n < 3; n++) {
      const i = this.spawn();
      if (i < 0) return;
      const spread = (n - 1) * 9;
      this.set(
        i,
        KIND_SCRIBBLE,
        px - (dirX / len) * 10 + (-dirY / len) * spread,
        py - (dirY / len) * 10 + (dirX / len) * spread,
        -(dirX / len) * 0.05,
        -(dirY / len) * 0.05,
        200,
        26 + this.random() * 14,
        0,
      );
    }
  }

  /** The one-frame flash on a surface a grab just connected with (§2.7). */
  flash(px: number, py: number): void {
    const i = this.spawn();
    if (i < 0) return;
    this.set(i, KIND_FLASH, px, py, 0, 0, 70, 22, 0);
  }

  /**
   * Map a host event to its visual. Unhandled kinds are ignored rather than
   * defaulted — an event with no drawn response should draw nothing, not a puff.
   */
  emit(event: GameEvent): void {
    switch (event.kind) {
      case 'death':
        this.burstConfetti(event.at.x, event.at.y, 8, event.seat);
        this.burstDust(event.at.x, event.at.y, 6);
        break;
      case 'respawn':
        this.burstConfetti(event.at.x, event.at.y, 5, event.seat);
        break;
      case 'checkpoint':
      case 'objective':
      case 'parcel':
        break;
      default:
        break;
    }
  }

  /** Impacts and releases the renderer derives from the render state. */
  impact(at: Vec2, seatIndex: SeatIndex): void {
    this.burstDust(at.x, at.y, 4);
    this.burstConfetti(at.x, at.y, 2, seatIndex);
  }

  update(dtMs: number): void {
    const dt = Math.max(0, Math.min(64, dtMs));
    let i = 0;
    while (i < this.live) {
      const remaining = this.life[i] - dt;
      if (remaining <= 0) {
        // Swap-remove: the last live particle takes this slot. O(1), no holes,
        // and nothing is allocated to track free space.
        const last = this.live - 1;
        if (i !== last) {
          this.x[i] = this.x[last];
          this.y[i] = this.y[last];
          this.vx[i] = this.vx[last];
          this.vy[i] = this.vy[last];
          this.rot[i] = this.rot[last];
          this.vrot[i] = this.vrot[last];
          this.life[i] = this.life[last];
          this.maxLife[i] = this.maxLife[last];
          this.size[i] = this.size[last];
          this.kind[i] = this.kind[last];
          this.seat[i] = this.seat[last];
        }
        this.live = last;
        continue;
      }
      this.life[i] = remaining;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vrot[i] * dt;
      if (this.kind[i] === KIND_CONFETTI || this.kind[i] === KIND_DUST) {
        // Paper falls slowly and sideways; that is most of why it reads as paper.
        this.vy[i] += 0.0012 * dt;
        this.vx[i] *= 0.985;
      }
      i++;
    }
  }

  draw(ctx: CanvasRenderingContext2D, palette: BumPalette, boil: BoilField): void {
    if (this.live === 0) return;
    this.setPalette(palette);
    const amplitude = boil.actor;

    for (let i = 0; i < this.live; i++) {
      const t = this.life[i] / this.maxLife[i];
      const kind = this.kind[i];
      const px = this.x[i];
      const py = this.y[i];
      const s = this.size[i];

      if (kind === KIND_CONFETTI) {
        // A torn scrap: a four-point sliver, foreshortened by its own spin so
        // it appears to tumble without any 3D.
        const spin = Math.cos(this.rot[i]);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(this.rot[i] * 0.4);
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = this.confettiColor;
        ctx.fillRect(-s / 2, (-s / 2) * spin, s, s * spin);
        ctx.strokeStyle = this.confettiEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(-s / 2, (-s / 2) * spin, s, s * spin);
        ctx.restore();
      } else if (kind === KIND_DUST) {
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle = this.dustColor;
        ctx.beginPath();
        ctx.arc(px, py, s * t, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === KIND_SCRIBBLE) {
        // Three points with the middle one kicked sideways: a scribble, not a line.
        const len = this.size[i];
        const a = this.rot[i];
        this.tailX[0] = px;
        this.tailY[0] = py;
        this.tailX[1] = px - Math.cos(a) * len * 0.5 + Math.sin(a) * 5;
        this.tailY[1] = py - Math.sin(a) * len * 0.5 - Math.cos(a) * 5;
        this.tailX[2] = px - Math.cos(a) * len;
        this.tailY[2] = py - Math.sin(a) * len;
        STROKE.width = 3;
        STROKE.color = this.scribbleColor;
        STROKE.alpha = t;
        STROKE.graphite = false;
        STROKE.boil = boil;
        STROKE.salt = i * 31;
        STROKE.amplitude = amplitude;
        STROKE.widthEnd = undefined;
        inkStroke(ctx, this.tailX, this.tailY, 3, STROKE);
      } else {
        ctx.globalAlpha = t;
        ctx.fillStyle = this.flashColor;
        ctx.beginPath();
        ctx.arc(px, py, s * (1.4 - t * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Death blots, newest last. Beyond `RENDER.MAX_SPLATS` the oldest fade out
   * rather than vanishing — a section you have failed twelve times should look
   * progressively worse, not reset.
   *
   * Culled against the camera, because the whole point of a splat is that it
   * stays where you died, and where you died is usually not where you are.
   */
  drawSplats(
    ctx: CanvasRenderingContext2D,
    splats: readonly RenderSplat[],
    palette: BumPalette,
    view: Rect,
  ): void {
    if (splats.length === 0) return;
    this.setPalette(palette);
    const total = splats.length;
    const start = Math.max(0, total - RENDER.MAX_SPLATS);
    const fadeCount = 6;
    // The blot's radius is `SPLAT_SCALE` × its largest radius (< 1.8), so 48 is
    // a margin nothing can peek past.
    const margin = 48;
    for (let i = start; i < total; i++) {
      const splat = splats[i];
      if (
        splat.at.x < view.x - margin ||
        splat.at.x > view.x + view.w + margin ||
        splat.at.y < view.y - margin ||
        splat.at.y > view.y + view.h + margin
      ) {
        continue;
      }
      const age = i - start;
      const alpha = age < fadeCount ? 0.25 + (age / fadeCount) * 0.55 : 0.8;
      const shape = (splat.sprite >>> 0) % SPLAT_SHAPES;
      inkBlob(
        ctx,
        splat.at.x,
        splat.at.y,
        SPLAT_VIEWS[shape],
        SPLAT_POINTS,
        splat.angle,
        SPLAT_SCALE,
        this.splatColors[splat.seat & 3],
        alpha,
      );
    }
  }
}

/**
 * The splat shape as `RenderState` publishes it — derived from the contract
 * rather than restated, so a change to `types.ts` fails here instead of drifting.
 */
export type RenderSplat = RenderState['splats'][number];
