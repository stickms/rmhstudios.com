/**
 * The frame.
 *
 * Owns the six layers, the stage fit, the camera transform, the drawing
 * buffer's size, and the degradation ladder. Everything else in this directory
 * is a drawing vocabulary; this is the only file that decides *when* and *at
 * what resolution* any of it happens.
 *
 * ## Aspect ratio is the contract
 *
 * The playfield is 16:9 design space — `PHYSICS.DESIGN_WIDTH × DESIGN_HEIGHT`,
 * 1920×1080 — and it must land on every viewport the game can be opened in
 * (21:9 ultrawide, 4:3 tablet, 20:9 phone landscape, a phone held in portrait)
 * **letterboxed, never skewed, never clipped**. {@link fitStage} is that rule
 * as one uniform scale plus two offsets: `min` of the two ratios, so the whole
 * stage always fits and the leftover becomes bars. `max` would fill the screen
 * and cut the playfield off; two different scales would stretch the drawing.
 * Both are one character away from each other and one of them is a bug that a
 * developer on a 16:9 monitor will never see, which is why this lives in one
 * tested function rather than in CSS (design doc §12.1 rule 2).
 *
 * ## The drawing buffer
 *
 * Sized through `gameSurfaceDpr()` (capped at 2 — a game re-rasterises its
 * whole surface 60 times a second and fill rate goes as the *square* of the
 * ratio), and the same number is used for the render transform, because sizing
 * the buffer at one ratio and drawing at another silently scales the scene.
 * `canvas.width` is assigned **only** on a real size change: assigning it
 * reallocates the backing store and clears it, so doing it per frame is both a
 * per-frame allocation and a hidden clear (§12.1 rule 4).
 *
 * ## What is redrawn
 *
 * Layers 0, 1, 2 and 5 are baked and blitted (`paper.ts`, `worldbake.ts`).
 * Only actors, live props and FX are drawn per frame. The budget on a 2022
 * mid-range Android is ≤5 ms for actors+FX and ≤1.5 ms for the blits (§17), and
 * {@link RenderStats} reports both so the number is checkable rather than
 * claimed.
 *
 * ## The loop lives outside
 *
 * This renderer does not call `requestAnimationFrame`. The component that
 * mounts the canvas owns the loop (and its cancel-on-unmount), which keeps the
 * one settle/stop condition in the one place a reviewer looks for it, and lets
 * a guest client drive the same renderer from interpolated snapshots with no
 * engine present.
 */

import { gameSurfaceDpr, MAX_GAME_DPR, type DisplayScaleSource } from '@/lib/display-scale';
import { isLowEndDevice } from '@/lib/perf-tier';
import { CAMERA, PHYSICS, RENDER } from '../constants';
import type { GameEvent, Level, Rect, RenderState, Vec2 } from '../types';
import { createBoil, saltFromId, type BoilField } from './boil';
import { drawSeat, type ActorContext } from './actors';
import { FxSystem } from './fx';
import {
  bakePaperTile,
  drawPaperBase,
  paperPattern,
  releaseSurface,
  type PaperTile,
} from './paper';
import { PatternCache } from './patterns';
import { mixColor, readBumPalette, withLevelPalette, type BumPalette } from './theme';
import {
  bakeWorld,
  blitLayer,
  paintNote,
  drawHazard,
  drawProp,
  drawNoteCard,
  type WorldBake,
} from './worldbake';

const DESIGN_W = PHYSICS.DESIGN_WIDTH;
const DESIGN_H = PHYSICS.DESIGN_HEIGHT;

// ─── Stage fit ──────────────────────────────────────────────────────────────

export interface StageFit {
  /** CSS px per design px. One number for both axes — that is the no-skew promise. */
  readonly scale: number;
  /** Left letterbox bar, in CSS px. */
  readonly offsetX: number;
  /** Top letterbox bar, in CSS px. */
  readonly offsetY: number;
  /** The stage itself, in CSS px. Always exactly 16:9. */
  readonly width: number;
  readonly height: number;
  readonly viewportW: number;
  readonly viewportH: number;
}

const EMPTY_FIT: StageFit = {
  scale: 0,
  offsetX: 0,
  offsetY: 0,
  width: 0,
  height: 0,
  viewportW: 0,
  viewportH: 0,
};

/**
 * Fit the 16:9 stage into a viewport, centred, with the leftover as bars.
 *
 * `min` of the two ratios — contain, not cover. A degenerate viewport (zero or
 * not-a-number, which is what a canvas measures at before layout) returns a
 * zero fit rather than a NaN transform that would poison every later frame.
 */
export function fitStage(viewportW: number, viewportH: number): StageFit {
  if (
    !Number.isFinite(viewportW) ||
    !Number.isFinite(viewportH) ||
    viewportW <= 0 ||
    viewportH <= 0
  ) {
    return EMPTY_FIT;
  }
  const scale = Math.min(viewportW / DESIGN_W, viewportH / DESIGN_H);
  const width = DESIGN_W * scale;
  const height = DESIGN_H * scale;
  return {
    scale,
    offsetX: (viewportW - width) / 2,
    offsetY: (viewportH - height) / 2,
    width,
    height,
    viewportW,
    viewportH,
  };
}

// ─── Camera transform ───────────────────────────────────────────────────────

/**
 * An affine transform with no skew terms, because there are none: the stage
 * scale is uniform and the camera only pans and zooms. Keeping `b` and `c` out
 * of the type is the cheapest possible statement that the drawing is never
 * sheared.
 */
export interface Transform2D {
  a: number;
  d: number;
  e: number;
  f: number;
}

export interface CameraView {
  x: number;
  y: number;
  zoom: number;
}

/**
 * World px → device px.
 *
 * The world point at the camera centre lands at the centre of the stage; one
 * world px covers `dpr × fit.scale × zoom` device px. `dpr` must be the same
 * number the drawing buffer was sized with.
 */
export function worldTransform(
  fit: StageFit,
  camera: CameraView,
  dpr: number,
  out: Transform2D,
): Transform2D {
  const zoom = sanitiseZoom(camera.zoom);
  const k = dpr * fit.scale * zoom;
  out.a = k;
  out.d = k;
  out.e = dpr * (fit.offsetX + fit.scale * (DESIGN_W / 2 - zoom * camera.x));
  out.f = dpr * (fit.offsetY + fit.scale * (DESIGN_H / 2 - zoom * camera.y));
  return out;
}

/**
 * The slice of the world the stage currently shows. Drives the paper fill, the
 * baked-layer blits and prop culling — all three of which would otherwise pay
 * for the whole level regardless of where the camera is.
 */
export function visibleWorldRect(fit: StageFit, camera: CameraView, out: Rect): Rect {
  const zoom = sanitiseZoom(camera.zoom);
  out.w = DESIGN_W / zoom;
  out.h = DESIGN_H / zoom;
  out.x = camera.x - out.w / 2;
  out.y = camera.y - out.h / 2;
  return out;
}

/**
 * Defend the transform against a bad camera. A NaN zoom (a divide by a
 * player-count of zero, a snapshot that arrived half-decoded) would otherwise
 * make every subsequent `setTransform` a no-op and the screen go blank with no
 * error anywhere.
 */
function sanitiseZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(CAMERA.MAX_ZOOM, Math.max(CAMERA.MIN_ZOOM, zoom));
}

// ─── DPR ────────────────────────────────────────────────────────────────────

/**
 * The ladder's DPR rungs (§17 step 3). Only ever stepped down; a device that
 * starts at 1 has nowhere to go, which is correct.
 */
export const DPR_LADDER = [MAX_GAME_DPR, 1.5, 1] as const;

/** `perf-lite` phones cap one rung lower before the ladder does anything (§12.3). */
export const LOW_END_DPR_CAP = 1.5;

export interface DprOptions {
  lowEnd: boolean;
  /** 0…2 — how far down {@link DPR_LADDER} the degradation ladder has walked. */
  step: number;
}

/**
 * The ratio to size the drawing buffer at.
 *
 * `gameSurfaceDpr()` owns the display reading and the hard 2× cap; this adds
 * the two game-specific limits on top — the low-end tier and the ladder — and
 * is the only function that produces the number, so the buffer and the
 * transform cannot disagree.
 */
export function stageDpr(source: DisplayScaleSource, options: DprOptions): number {
  const base = gameSurfaceDpr(source);
  const step = Math.max(0, Math.min(DPR_LADDER.length - 1, Math.floor(options.step)));
  const cap = options.lowEnd ? LOW_END_DPR_CAP : MAX_GAME_DPR;
  return Math.min(base, cap, DPR_LADDER[step]);
}

// ─── The degradation ladder (§17) ───────────────────────────────────────────

export const QUALITY_FULL = 0;
export const QUALITY_NO_BOIL = 1;
export const QUALITY_FEWER_PARTICLES = 2;
export const QUALITY_LOWER_DPR = 3;
export const QUALITY_HALF_RATE = 4;
const QUALITY_MAX = QUALITY_HALF_RATE;

/** ~2 s of samples at 60fps — the window §17 asks the decision to be made over. */
const SAMPLE_WINDOW = 120;
/** Recompute the median every N frames; sorting 120 numbers per frame is silly. */
const MEDIAN_EVERY = 20;
/** Sustained below ~54fps degrades. */
const DEGRADE_MS = 18.5;
/** Sustained above ~64fps for RECOVER_MS recovers. Hysteresis, or it oscillates. */
const RECOVER_FRAME_MS = 15.5;
const RECOVER_MS = 10_000;

/**
 * Steps quality down on a **rolling median** of frame time and back up only
 * after ten seconds of comfort.
 *
 * A median, not a mean, and never a single frame: one 40 ms frame is a texture
 * upload or a GC, and reacting to it would make the game drop its boil every
 * time the player opened the pause menu. A mean would let three terrible frames
 * outvote a hundred good ones.
 */
export class QualityLadder {
  private readonly samples = new Float64Array(SAMPLE_WINDOW);
  private readonly sorted = new Float64Array(SAMPLE_WINDOW);
  private filled = 0;
  private cursor = 0;
  private sinceMedian = 0;
  private median = 0;
  private goodSinceMs = 0;
  private stepValue: number;

  constructor(initialStep = 0) {
    this.stepValue = Math.max(0, Math.min(QUALITY_MAX, initialStep));
  }

  get step(): number {
    return this.stepValue;
  }

  get medianFrameMs(): number {
    return this.median;
  }

  /** Feed one frame interval. Returns true when the step changed this frame. */
  push(frameMs: number, nowMs: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return false;
    // A frame longer than a quarter second is a tab that was backgrounded, not
    // a slow frame; letting it into the window would degrade the game for
    // someone who simply looked away.
    this.samples[this.cursor] = Math.min(frameMs, 250);
    this.cursor = (this.cursor + 1) % SAMPLE_WINDOW;
    if (this.filled < SAMPLE_WINDOW) this.filled++;
    if (++this.sinceMedian < MEDIAN_EVERY || this.filled < SAMPLE_WINDOW) return false;
    this.sinceMedian = 0;

    this.sorted.set(this.samples);
    this.sorted.sort();
    this.median = this.sorted[SAMPLE_WINDOW >> 1];

    if (this.median > DEGRADE_MS && this.stepValue < QUALITY_MAX) {
      this.stepValue++;
      this.goodSinceMs = 0;
      this.reset();
      return true;
    }
    if (this.median < RECOVER_FRAME_MS && this.stepValue > 0) {
      if (this.goodSinceMs === 0) this.goodSinceMs = nowMs;
      else if (nowMs - this.goodSinceMs >= RECOVER_MS) {
        this.stepValue--;
        this.goodSinceMs = 0;
        this.reset();
        return true;
      }
    } else {
      this.goodSinceMs = 0;
    }
    return false;
  }

  /** Forget the window — after a step change the old samples describe a different renderer. */
  private reset(): void {
    this.filled = 0;
    this.cursor = 0;
    this.sinceMedian = 0;
  }
}

// ─── Public renderer ────────────────────────────────────────────────────────

export interface RendererOptions {
  /**
   * Passed in rather than read here: the component layer owns the media query
   * (and its change listener), and a renderer that read `matchMedia` itself
   * would be untestable and would disagree with the DOM chrome for a frame.
   */
  reducedMotion: boolean;
  /** Defaults to `isLowEndDevice()`. Overridable so tests and QA can force the tier. */
  lowEnd?: boolean;
  /** The `.bums-theme` host to read `--bum-*` off. Defaults to the canvas's own ancestor. */
  themeElement?: Element | null;
  /** Display names per seat index for the in-world tags. */
  names?: readonly (string | null)[];
  /** Settings → "Always show name tags". */
  showTags?: boolean;
  /** Resolves a decoration's `textKey`; the component passes i18next's `t`. */
  translate?: (key: string) => string;
  /** Window-like source for the device pixel ratio. Injected for tests. */
  displaySource?: DisplayScaleSource;
}

export interface RenderStats {
  /** Total time inside the last `frame()` call. */
  frameMs: number;
  /** Baked-layer blits — the §17 ≤1.5 ms line. */
  blitMs: number;
  /** Actors, live props and FX — the §17 ≤5 ms line. */
  actorMs: number;
  dpr: number;
  qualityStep: number;
  medianFrameMs: number;
  particles: number;
  drawnProps: number;
  fit: StageFit;
}

export interface BumsRushRenderer {
  /** Re-measure the canvas, resize the buffer, refit the stage. Call on resize/orientation change. */
  resize(): void;
  /** Draw one frame. `nowMs` defaults to `performance.now()`. */
  frame(state: RenderState, nowMs?: number): void;
  /** Feed a host event its visual response. */
  emit(event: GameEvent): void;
  setLevel(level: Level): void;
  setReducedMotion(reduced: boolean): void;
  setNames(names: readonly (string | null)[]): void;
  setShowTags(show: boolean): void;
  readonly stats: RenderStats;
  dispose(): void;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

class Renderer implements BumsRushRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly patterns = new PatternCache();
  private readonly fx: FxSystem;
  private readonly ladder: QualityLadder;
  private readonly boil: BoilField;
  private readonly transform: Transform2D = { a: 1, d: 1, e: 0, f: 0 };
  private readonly view: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly actorCtx: ActorContext;
  /** Previous vertical scale per seat — the squash edge that means "impact". */
  private readonly lastSquash = new Float32Array(4);
  private readonly nextScribbleMs = new Float32Array(4);
  /** Previous grip state, two hands per seat — the edge that means "grab connected". */
  private readonly lastGrip = new Uint8Array(8);

  private level: Level;
  private basePalette: BumPalette;
  private palette: BumPalette;
  private letterbox = '';
  private bake: WorldBake | null = null;
  private tile: PaperTile | null = null;
  private pattern: CanvasPattern | null = null;
  private fit: StageFit = EMPTY_FIT;
  private dpr = 1;
  private bakedDensity = -1;
  private reducedMotion: boolean;
  private bufferW = 0;
  private bufferH = 0;
  private lastFrameAt = 0;
  private parity = 0;
  private noteScroll = 0;
  private disposed = false;
  private readonly lowEnd: boolean;
  private readonly displaySource: DisplayScaleSource;
  private readonly translate: (key: string) => string;

  readonly stats: RenderStats = {
    frameMs: 0,
    blitMs: 0,
    actorMs: 0,
    dpr: 1,
    qualityStep: 0,
    medianFrameMs: 0,
    particles: 0,
    drawnProps: 0,
    fit: EMPTY_FIT,
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    level: Level,
    options: RendererOptions,
  ) {
    // `alpha: false` lets the compositor skip per-pixel blending; the sheet
    // covers every pixel, letterbox included, so there is nothing to see behind.
    const ctx =
      (canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null) ??
      canvas.getContext('2d');
    if (!ctx) throw new Error('Bum’s Rush: 2D context unavailable');
    this.ctx = ctx;
    this.level = level;
    this.lowEnd = options.lowEnd ?? isLowEndDevice();
    this.displaySource =
      options.displaySource ?? (typeof window !== 'undefined' ? window : { devicePixelRatio: 1 });
    this.translate = options.translate ?? ((key: string) => key);

    const host =
      options.themeElement ??
      (typeof canvas.closest === 'function' ? canvas.closest('.bums-theme') : null) ??
      (typeof document !== 'undefined' ? document.documentElement : null);
    this.basePalette = readBumPalette(host);
    this.palette = withLevelPalette(this.basePalette, level.palette);

    // A weak device starts one rung down rather than discovering the same thing
    // two seconds in — §12.3 asks for exactly this, and the ladder can still
    // walk it back up if the phone turns out to cope.
    this.ladder = new QualityLadder(this.lowEnd ? QUALITY_NO_BOIL : QUALITY_FULL);
    this.reducedMotion = options.reducedMotion;
    this.boil = createBoil(saltFromId(level.id), options.reducedMotion);
    this.boil.setEnabled(this.ladder.step < QUALITY_NO_BOIL);
    this.fx = new FxSystem(saltFromId(level.id) ^ 0x5f5f);
    this.applyQuality();

    this.actorCtx = {
      palette: this.palette,
      boil: this.boil,
      names: options.names ?? [null, null, null, null],
      showTags: options.showTags ?? false,
      zoom: 1,
    };

    this.resize();
  }

  // ── sizing ────────────────────────────────────────────────────────────────

  /**
   * The only place `canvas.width`/`height` are assigned. Assigning either
   * reallocates the backing store and clears the surface, so it happens on a
   * real size change and nowhere else — never inside `frame()`.
   */
  resize(): void {
    if (this.disposed) return;
    const cssW = this.canvas.clientWidth || this.canvas.width / (this.dpr || 1);
    const cssH = this.canvas.clientHeight || this.canvas.height / (this.dpr || 1);
    const dpr = stageDpr(this.displaySource, { lowEnd: this.lowEnd, step: this.dprStep() });
    const bufferW = Math.max(1, Math.round(cssW * dpr));
    const bufferH = Math.max(1, Math.round(cssH * dpr));

    this.fit = fitStage(cssW, cssH);
    this.stats.fit = this.fit;
    this.dpr = dpr;
    this.stats.dpr = dpr;

    if (bufferW !== this.bufferW || bufferH !== this.bufferH) {
      this.canvas.width = bufferW;
      this.canvas.height = bufferH;
      this.bufferW = bufferW;
      this.bufferH = bufferH;
    }
    this.rebake();
  }

  /** Device px per world px at zoom 1 — what the bakes and patterns are sized for. */
  private density(): number {
    return Math.max(0.25, this.fit.scale * this.dpr);
  }

  /**
   * Re-bake the static layers.
   *
   * Guarded on a quantised density because `resize()` fires on every step of a
   * window drag and a rotation, and re-baking a level-sized surface per step
   * would turn a resize into a stutter. A quarter-step of density is well below
   * what anyone can see on a paper texture, and `force` covers the cases where
   * the *content* changed rather than the resolution (a new level, a new
   * palette, the boil switching off).
   */
  private rebake(force = false): void {
    const density = this.density();
    const quantised = Math.round(density * 4) / 4;
    if (!force && quantised === this.bakedDensity && this.bake) return;
    this.bakedDensity = quantised;
    this.bake?.dispose();
    releaseSurface(this.tile?.surface ?? null);
    this.patterns.dispose();

    // World 7 is cold grey graph paper (§6.6) — the only world whose sheet is
    // ruled both ways.
    this.tile = bakePaperTile(this.palette, {
      density,
      grid: this.level.world === 7,
      seed: saltFromId(this.level.id),
    });
    this.pattern = paperPattern(this.ctx, this.tile);
    this.bake = bakeWorld(this.level, this.palette, this.boil, {
      density,
      patterns: this.patterns,
      translate: this.translate,
    });
    this.letterbox = mixColor(this.palette.paperEdge, this.palette.ink, 0.42);
  }

  // ── quality ───────────────────────────────────────────────────────────────

  private dprStep(): number {
    const step = this.ladder.step;
    return step >= QUALITY_LOWER_DPR ? (step >= QUALITY_HALF_RATE ? 2 : 1) : 0;
  }

  private applyQuality(): void {
    const step = this.ladder.step;
    this.boil.setEnabled(step < QUALITY_NO_BOIL);
    this.fx.setCap(
      step >= QUALITY_FEWER_PARTICLES ? RENDER.MAX_PARTICLES / 2 : RENDER.MAX_PARTICLES,
    );
    this.stats.qualityStep = step;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.boil.setReducedMotion(reduced);
    // The bakes hold a frozen sample of the boil, so a change to it is a rebake
    // — cheap, and it only happens when the user changes a system preference.
    this.rebake(true);
  }

  setNames(names: readonly (string | null)[]): void {
    this.actorCtx.names = names;
  }

  setShowTags(show: boolean): void {
    this.actorCtx.showTags = show;
  }

  setLevel(level: Level): void {
    this.level = level;
    this.palette = withLevelPalette(this.basePalette, level.palette);
    this.actorCtx.palette = this.palette;
    this.fx.clear();
    this.rebake(true);
  }

  emit(event: GameEvent): void {
    this.fx.emit(event);
  }

  // ── the frame ─────────────────────────────────────────────────────────────

  frame(state: RenderState, nowMs: number = now()): void {
    if (this.disposed || this.fit.scale <= 0) return;
    const t0 = now();

    const dt = this.lastFrameAt === 0 ? 16.7 : nowMs - this.lastFrameAt;
    this.lastFrameAt = nowMs;
    if (this.ladder.push(dt, nowMs)) {
      this.applyQuality();
      // A DPR rung needs a real resize; a boil or particle rung does not.
      if (
        this.stats.dpr !==
        stageDpr(this.displaySource, { lowEnd: this.lowEnd, step: this.dprStep() })
      ) {
        this.resize();
      }
    }
    this.stats.medianFrameMs = this.ladder.medianFrameMs;

    this.fx.update(dt);
    // A note that scrolls is motion, and the note's text already exists in the
    // HUD's screen-reader region (§13), so reduced motion parks it at the top
    // rather than trading one accessibility commitment for another.
    if (!this.reducedMotion) this.noteScroll += dt * 0.02;
    this.deriveJuice(state, nowMs);

    // Rung 4: render at half rate with the simulation still at 60Hz. A locked
    // 30 is what a phone should fall back to — a variable frame rate is what
    // feels broken (§12.4).
    this.parity ^= 1;
    if (this.ladder.step >= QUALITY_HALF_RATE && this.parity === 1) {
      this.stats.frameMs = now() - t0;
      return;
    }

    this.boil.advance(state.frame);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.bufferW, this.bufferH);
    // The desk the sheet is lying on. The HUD sits over this, in the letterbox.
    ctx.fillStyle = this.letterbox;
    ctx.fillRect(0, 0, this.bufferW, this.bufferH);

    ctx.save();
    // Clip to the stage so nothing in the world can draw into the letterbox,
    // where the HUD lives.
    ctx.beginPath();
    ctx.rect(
      this.fit.offsetX * this.dpr,
      this.fit.offsetY * this.dpr,
      this.fit.width * this.dpr,
      this.fit.height * this.dpr,
    );
    ctx.clip();

    const camera = state.camera;
    const t = worldTransform(this.fit, camera, this.dpr, this.transform);
    ctx.setTransform(t.a, 0, 0, t.d, t.e, t.f);
    visibleWorldRect(this.fit, camera, this.view);
    this.actorCtx.zoom = camera.zoom;

    const tBlit = now();
    // Layer 0 — the sheet.
    drawPaperBase(
      ctx,
      this.view.x,
      this.view.y,
      this.view.w,
      this.view.h,
      this.palette,
      this.pattern,
    );
    // Layers 1 + 2 — pencil and world ink.
    blitLayer(ctx, this.bake?.under ?? null, this.view.x, this.view.y, this.view.w, this.view.h);
    const blitStart = now() - tBlit;

    const tActors = now();
    this.drawLiveProps(state);
    this.fx.drawSplats(ctx, state.splats, this.palette, this.view);
    for (const seat of state.seats) {
      drawSeat(ctx, seat, this.actorCtx);
    }
    this.fx.draw(ctx, this.palette, this.boil);
    this.stats.actorMs = now() - tActors;

    const tOver = now();
    // Layer 5 — in-world chrome, over the cast.
    blitLayer(ctx, this.bake?.over ?? null, this.view.x, this.view.y, this.view.w, this.view.h);
    this.drawScrollingNotes(ctx);
    this.stats.blitMs = blitStart + (now() - tOver);

    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.stats.particles = this.fx.active;
    this.stats.frameMs = now() - t0;
  }

  /**
   * Props and cycling hazards come off the render state, so they cannot be
   * baked. Culled against the camera frustum first: a level's sixty props are
   * mostly somewhere else (§12.4).
   */
  private drawLiveProps(state: RenderState): void {
    const bake = this.bake;
    if (!bake) return;
    // Props have no size on `RenderProp`, so the cull uses a generous margin
    // rather than a real AABB — cheap, and erring toward drawing is the safe
    // direction for a culling bug.
    const margin = 260;
    const minX = this.view.x - margin;
    const maxX = this.view.x + this.view.w + margin;
    const minY = this.view.y - margin;
    const maxY = this.view.y + this.view.h + margin;
    let drawn = 0;
    const density = this.density();
    for (const prop of state.props) {
      if (prop.at.x < minX || prop.at.x > maxX || prop.at.y < minY || prop.at.y > maxY) continue;
      drawProp(
        this.ctx,
        prop,
        bake.propsById.get(prop.id),
        this.palette,
        this.patterns,
        this.boil,
        density,
      );
      drawn++;
    }
    for (const hazard of state.hazards) {
      drawHazard(this.ctx, hazard, bake.hazardsById.get(hazard.id), this.palette, this.boil);
    }
    this.stats.drawnProps = drawn;
  }

  /**
   * The notes whose translated text did not fit even after one shrink. They are
   * the only text in the pipeline that cannot be baked, and there are usually
   * none — a level with three of them is a level whose strings need editing.
   */
  private drawScrollingNotes(ctx: CanvasRenderingContext2D): void {
    const notes = this.bake?.liveNotes;
    if (!notes || notes.length === 0) return;
    for (const note of notes) {
      if (
        note.box.x + note.box.w < this.view.x ||
        note.box.x > this.view.x + this.view.w ||
        note.box.y + note.box.h < this.view.y ||
        note.box.y > this.view.y + this.view.h
      ) {
        continue;
      }
      ctx.save();
      ctx.translate(note.box.x + note.box.w / 2, note.box.y + note.box.h / 2);
      ctx.rotate(note.angle);
      ctx.translate(-(note.box.x + note.box.w / 2), -(note.box.y + note.box.h / 2));
      drawNoteCard(ctx, note.box, this.palette, this.boil, 0);
      paintNote(ctx, note.layout, note.box, this.palette, { scrollPx: this.noteScroll });
      ctx.restore();
    }
  }

  /**
   * Squash and speed are already on `RenderSeat`; the *events* they imply are
   * not. Deriving the dust puff from the squash edge and the speed scribbles
   * from sustained stretch keeps the juice working for a guest client, which
   * receives interpolated snapshots and no events at all (§9.5).
   */
  private deriveJuice(state: RenderState, nowMs: number): void {
    for (const seat of state.seats) {
      const index = seat.seat & 3;
      if (seat.state !== 'alive') {
        this.lastSquash[index] = 1;
        this.lastGrip[index * 2] = 0;
        this.lastGrip[index * 2 + 1] = 0;
        continue;
      }

      // Grab connects → a one-frame flash on the surface (§2.7). The `grip`
      // event carries no position, so the flash is placed from the hand that
      // just closed rather than from the event — which also means a guest
      // client, which receives no events at all, still sees it.
      this.flashOnGrab(seat.armL, seat.gripL, index * 2);
      this.flashOnGrab(seat.armR, seat.gripR, index * 2 + 1);
      const squash = Math.min(seat.scaleX, seat.scaleY);
      if (
        squash <= RENDER.SQUASH_ON_IMPACT + 0.03 &&
        this.lastSquash[index] > RENDER.SQUASH_ON_IMPACT + 0.03
      ) {
        this.fx.impact(seat.head, seat.seat);
      }
      this.lastSquash[index] = squash;

      const stretch = Math.max(seat.scaleX, seat.scaleY);
      if (stretch > 1 + RENDER.STRETCH_MAX * 0.6 && nowMs >= this.nextScribbleMs[index]) {
        // The stretch axis IS the velocity axis (§2.7), so the head's own angle
        // is the direction of travel — no velocity needs to cross the wire.
        const along = seat.scaleX >= seat.scaleY ? 0 : Math.PI / 2;
        const a = seat.headAngle + along;
        this.fx.scribble(seat.head.x, seat.head.y, Math.cos(a), Math.sin(a));
        this.nextScribbleMs[index] = nowMs + 140;
      }
    }
  }

  private flashOnGrab(arm: readonly Vec2[], gripping: boolean, slot: number): void {
    const was = this.lastGrip[slot] === 1;
    this.lastGrip[slot] = gripping ? 1 : 0;
    if (!gripping || was || arm.length === 0) return;
    const hand = arm[arm.length - 1];
    this.fx.flash(hand.x, hand.y);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bake?.dispose();
    this.bake = null;
    releaseSurface(this.tile?.surface ?? null);
    this.tile = null;
    this.pattern = null;
    this.patterns.dispose();
    this.fx.clear();
  }
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  level: Level,
  options: RendererOptions,
): BumsRushRenderer {
  return new Renderer(canvas, level, options);
}
