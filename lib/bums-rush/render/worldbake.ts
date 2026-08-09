/**
 * Layers 1, 2 and 5 — everything on the sheet that is not a character.
 *
 * The pencil under-drawing, the world ink, and the in-world chrome are baked
 * once per level into two offscreen surfaces and blitted; that is the whole
 * reason a phone can draw this game at 60fps (§12.4). Two surfaces rather than
 * one because the layer order in §2.3 puts the chrome (sticky notes, doodle
 * arrows, the goal's highlighter wash) *over* the actors and everything else
 * *under* them.
 *
 * ## What is baked and what is not
 *
 * The rule is simple enough to hold in your head: **if the simulation publishes
 * it every frame, it is not baked.** `RenderState.props` and
 * `RenderState.hazards` carry live transforms and cycling states, so those are
 * drawn per frame from {@link drawProp} / {@link drawHazard} using the authored
 * `Prop`/`Hazard` for the parts that never change (size, path, shape). Level
 * `geometry`, `decorations`, `assistBeams`, `checkpoints`, the goal and the
 * paper furniture never move, so they are baked.
 *
 * ## The bake resolution, and why it is capped
 *
 * A level is bigger than a screen — several screens, in the gauntlets. Baking
 * one at full device resolution would be tens of megabytes per layer on the
 * device least able to spare it, so the bake scale is `min(deviceScale,
 * sqrt(MAX_BAKE_PIXELS / levelArea))`. A big level therefore bakes soft and is
 * magnified slightly; that is the right trade for a hand-drawn look, and the
 * boil hides what is left. The upgrade path, if levels grow past this, is a
 * tiled LRU bake rather than a bigger cap.
 *
 * ## The rect convention
 *
 * `Shape` of kind `rect` is read as **top-left + size**, matching `Rect` and
 * `Level.bounds`, and `angle` rotates about the rect's centre. `poly` points
 * are relative to `(x, y)` and rotate about it. If the physics tier turns out
 * to read rects as centre-anchored, {@link shapePoints} is the one place to fix
 * it.
 */

import { PHYSICS } from '../constants';
import type {
  Decoration,
  GeometryPiece,
  Hazard,
  Level,
  Prop,
  Rect,
  RenderProp,
  RenderState,
  Shape,
  Vec2,
} from '../types';
import { saltFromId, vertexId, type BoilField } from './boil';
import {
  inkArc,
  inkCircle,
  inkLine,
  inkPolygon,
  inkStroke,
  type ShapeOptions,
  type StrokeOptions,
} from './ink';
import { createSurface, drawSheetFurniture, releaseSurface, type Surface } from './paper';
import { PatternCache } from './patterns';
import { isDarkPaper, mixColor, withAlpha, type BumPalette } from './theme';

/**
 * ~4.2M px per baked layer (2048² equivalent) — 16 MB at RGBA. Two layers plus
 * the pattern tiles keeps the renderer's offscreen footprint around 35 MB,
 * which a 2022 mid-range Android has and a 2018 one survives.
 */
export const MAX_BAKE_PIXELS = 4_194_304;

/** Points buffer for shape tracing. 256 covers any sane authored polygon. */
const SHAPE_MAX = 256;
const SX = new Float64Array(SHAPE_MAX);
const SY = new Float64Array(SHAPE_MAX);

export interface BakeLayer {
  readonly surface: Surface;
  /** Bake px per world px. */
  readonly scale: number;
  /** World coordinates of the layer's top-left pixel. */
  readonly originX: number;
  readonly originY: number;
  /** World extent the layer covers. */
  readonly worldW: number;
  readonly worldH: number;
}

/** A sticky note whose text did not fit even after shrinking, so it scrolls. */
export interface LiveNote {
  readonly box: Rect;
  readonly text: string;
  readonly angle: number;
  layout: NoteLayout;
}

export interface WorldBake {
  readonly under: BakeLayer | null;
  readonly over: BakeLayer | null;
  /** Authored props by id, so the live pass can find a prop's size. */
  readonly propsById: ReadonlyMap<string, Prop>;
  readonly hazardsById: ReadonlyMap<string, Hazard>;
  /** Notes that overflow their card; the renderer scrolls these per frame. */
  readonly liveNotes: LiveNote[];
  dispose(): void;
}

export interface BakeOptions {
  /** Device px per world px the camera will typically show. Drives bake sharpness. */
  density: number;
  patterns: PatternCache;
  /** Resolves a `Decoration` note's `textKey`. Defaults to the key itself. */
  translate?: (key: string) => string;
}

// ─── Shapes ─────────────────────────────────────────────────────────────────

function rotate(px: number, py: number, cx: number, cy: number, angle: number, out: Vec2): void {
  if (angle === 0) {
    out.x = px;
    out.y = py;
    return;
  }
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  out.x = cx + dx * c - dy * s;
  out.y = cy + dx * s + dy * c;
}

const ROT_SCRATCH: Vec2 = { x: 0, y: 0 };

/**
 * Trace a `Shape` into the shared point buffers. Returns the point count, or 0
 * for shapes that are not polygons (circles, which the caller draws directly).
 */
export function shapePoints(shape: Shape): number {
  switch (shape.kind) {
    case 'rect': {
      const { x, y, w, h } = shape;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const a = shape.angle ?? 0;
      const xs = [x, x + w, x + w, x];
      const ys = [y, y, y + h, y + h];
      for (let i = 0; i < 4; i++) {
        rotate(xs[i], ys[i], cx, cy, a, ROT_SCRATCH);
        SX[i] = ROT_SCRATCH.x;
        SY[i] = ROT_SCRATCH.y;
      }
      return 4;
    }
    case 'poly': {
      const a = shape.angle ?? 0;
      const n = Math.min(shape.points.length, SHAPE_MAX);
      for (let i = 0; i < n; i++) {
        const p = shape.points[i];
        rotate(shape.x + p.x, shape.y + p.y, shape.x, shape.y, a, ROT_SCRATCH);
        SX[i] = ROT_SCRATCH.x;
        SY[i] = ROT_SCRATCH.y;
      }
      return n;
    }
    case 'chain': {
      const n = Math.min(shape.points.length, SHAPE_MAX);
      for (let i = 0; i < n; i++) {
        SX[i] = shape.points[i].x;
        SY[i] = shape.points[i].y;
      }
      return n;
    }
    case 'circle':
      return 0;
  }
}

/** The axis-aligned bounds of a shape, for frustum culling. */
export function shapeBounds(shape: Shape, out: Rect): Rect {
  if (shape.kind === 'circle') {
    out.x = shape.x - shape.r;
    out.y = shape.y - shape.r;
    out.w = shape.r * 2;
    out.h = shape.r * 2;
    return out;
  }
  const n = shapePoints(shape);
  const pad = shape.kind === 'chain' ? shape.thickness : 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (SX[i] < minX) minX = SX[i];
    if (SX[i] > maxX) maxX = SX[i];
    if (SY[i] < minY) minY = SY[i];
    if (SY[i] > maxY) maxY = SY[i];
  }
  out.x = minX - pad;
  out.y = minY - pad;
  out.w = maxX - minX + pad * 2;
  out.h = maxY - minY + pad * 2;
  return out;
}

// ─── The paper-construction vocabulary (§2.6) ───────────────────────────────

/**
 * Draw one piece of level geometry in its authored construction style.
 *
 * The five styles are a language for the player, not decoration: **drawn** is
 * static forever, **cut out** moves, **taped** can break, **pinned** rotates,
 * **torn** hurts. A player must be able to tell a moving platform from a wall
 * without waiting for it to move, and this function is where that promise is
 * kept.
 */
export function drawGeometry(
  ctx: CanvasRenderingContext2D,
  piece: GeometryPiece,
  palette: BumPalette,
  patterns: PatternCache,
  boil: BoilField,
  density: number,
  salt: number,
): void {
  const { shape, render } = piece;
  const fill = patterns.forMaterial(ctx, piece.material, palette, density);
  const composite: GlobalCompositeOperation = isDarkPaper(palette) ? 'screen' : 'multiply';

  // Cut-outs and taped pieces cast a small paper drop shadow; drawn ink does
  // not, because ink is *in* the paper, not on it.
  const lifted = render === 'cutout' || render === 'taped' || render === 'pinned';
  if (lifted) {
    drawShadow(ctx, shape, palette);
  }

  const base: ShapeOptions = {
    width: piece.grabbable ? 4 : 3,
    color: palette.ink,
    graphiteColor: palette.graphite,
    fill,
    fillComposite: composite,
    fillAlpha: 1,
    boil,
    salt,
    amplitude: boil.world,
  };

  if (shape.kind === 'circle') {
    inkCircle(ctx, shape.x, shape.y, shape.r, base, 24);
  } else if (shape.kind === 'chain') {
    const n = shapePoints(shape);
    inkStroke(ctx, SX, SY, n, { ...base, width: Math.max(2, shape.thickness) });
  } else {
    const n = shapePoints(shape);
    if (render === 'torn') {
      drawTornOutline(ctx, n, base, boil, salt);
    } else {
      inkPolygon(ctx, SX, SY, n, base);
    }
  }

  if (render === 'taped') drawTape(ctx, shape, palette, boil, salt);
  if (render === 'pinned') drawPin(ctx, shape, palette);
  // A grabbable surface gets the one extra affordance the game cannot do
  // without: short perpendicular ticks along the edge, the drawn equivalent of
  // "there is a lip here".
  if (piece.grabbable) drawGrabTicks(ctx, shape, palette, boil, salt);
}

function drawShadow(ctx: CanvasRenderingContext2D, shape: Shape, palette: BumPalette): void {
  ctx.save();
  ctx.translate(2, 3);
  ctx.fillStyle = withAlpha(palette.paperEdge, 0.75);
  ctx.beginPath();
  if (shape.kind === 'circle') {
    ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
  } else if (shape.kind === 'chain') {
    ctx.restore();
    return;
  } else {
    const n = shapePoints(shape);
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(SX[i], SY[i]);
      else ctx.lineTo(SX[i], SY[i]);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** A torn edge: the outline resampled with a saw of random depth. */
function drawTornOutline(
  ctx: CanvasRenderingContext2D,
  count: number,
  base: ShapeOptions,
  boil: BoilField,
  salt: number,
): void {
  const teeth = 3;
  let out = 0;
  const TX = TORN_X;
  const TY = TORN_Y;
  for (let i = 0; i < count && out < SHAPE_MAX - teeth; i++) {
    const j = (i + 1) % count;
    const x0 = SX[i];
    const y0 = SY[i];
    const dx = SX[j] - x0;
    const dy = SY[j] - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let t = 0; t < teeth && out < SHAPE_MAX; t++) {
      const k = t / teeth;
      // Alternating in/out bite, sized off the boil field so the tear is stable.
      const bite = (t % 2 === 0 ? 1 : -1) * (3 + Math.abs(boil.dx(salt + i * teeth + t, 4)));
      TX[out] = x0 + dx * k + nx * bite;
      TY[out] = y0 + dy * k + ny * bite;
      out++;
    }
  }
  for (let i = 0; i < out; i++) {
    SX[i] = TX[i];
    SY[i] = TY[i];
  }
  inkPolygon(ctx, SX, SY, out, base);
}

const TORN_X = new Float64Array(SHAPE_MAX);
const TORN_Y = new Float64Array(SHAPE_MAX);

/** Two strips of tape at opposite corners. Tape means "this can come off". */
function drawTape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const b = shapeBounds(shape, BOUNDS_SCRATCH);
  const w = 46;
  const h = 20;
  ctx.fillStyle = palette.tape;
  for (const [cx, cy, angle] of [
    [b.x, b.y, -0.6],
    [b.x + b.w, b.y + b.h, -0.6],
  ] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    inkLine(ctx, cx - 20, cy - 10, cx + 20, cy + 10, {
      width: 1.4,
      color: withAlpha(palette.ink, 0.3),
      graphite: false,
      boil,
      salt: salt + 900,
      amplitude: boil.world * 0.4,
    });
  }
}

/** A drawing pin — the mark of a rotation pivot. */
function drawPin(ctx: CanvasRenderingContext2D, shape: Shape, palette: BumPalette): void {
  const b = shapeBounds(shape, BOUNDS_SCRATCH);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  inkArc(ctx, cx, cy, 8, 0, Math.PI * 2, { width: 2.4, color: palette.ink, graphite: false }, 10);
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

/** "There is a lip here" — ticks along the top edge of a grabbable piece. */
function drawGrabTicks(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const b = shapeBounds(shape, BOUNDS_SCRATCH);
  const step = 34;
  const o: StrokeOptions = {
    width: 2,
    color: withAlpha(palette.ink, 0.55),
    graphite: false,
    boil,
    salt: salt + 700,
    amplitude: boil.world * 0.5,
  };
  for (let x = b.x + step / 2; x < b.x + b.w; x += step) {
    inkLine(ctx, x, b.y - 1, x, b.y - 8, o);
  }
}

const BOUNDS_SCRATCH: Rect = { x: 0, y: 0, w: 0, h: 0 };

// ─── Sticky-note text (§15) ─────────────────────────────────────────────────

export interface NoteOptions {
  fontSize?: number;
  lineHeight?: number;
  padding?: number;
  color?: string;
  font?: string;
  /** Vertical scroll in px, for a note whose text overflows even after shrinking. */
  scrollPx?: number;
}

export interface NoteLayout {
  readonly lines: string[];
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly contentHeight: number;
  /** True when even the shrunk text is taller than the card, so it must scroll. */
  readonly overflow: boolean;
}

const NOTE_FONT =
  '"Comic Sans MS", "Segoe Print", ui-rounded, ui-sans-serif, system-ui, sans-serif';
/** One shrink step, then scroll. Two steps make the second one unreadable anyway. */
const NOTE_SHRINK = 0.78;

function fontFor(size: number, family: string): string {
  return `${size}px ${family}`;
}

/**
 * Greedy wrap that does not assume spaces.
 *
 * German runs ~40% longer than English and compounds into single tokens that
 * are wider than the card; Japanese has no spaces at all. So: break on
 * whitespace first, and when one token still does not fit, break it by
 * characters. A note that overflows is a bug the translator cannot fix, so the
 * renderer has to be the one that copes.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  out: string[],
): void {
  out.length = 0;
  if (maxWidth <= 0) return;
  for (const paragraph of text.split('\n')) {
    const tokens = paragraph.split(/(\s+)/).filter((t) => t.length > 0);
    let line = '';
    const push = (): void => {
      out.push(line.trimEnd());
      line = '';
    };
    for (const token of tokens) {
      const candidate = line + token;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.length > 0) push();
      if (ctx.measureText(token).width <= maxWidth) {
        line = /^\s+$/.test(token) ? '' : token;
        continue;
      }
      // A single token wider than the card — break it by character.
      for (const ch of token) {
        if (ctx.measureText(line + ch).width > maxWidth && line.length > 0) push();
        line += ch;
      }
    }
    if (line.trimEnd().length > 0) out.push(line.trimEnd());
    else if (out.length === 0) out.push('');
  }
}

/**
 * Lay a note's text out inside a box: wrap, shrink once if it does not fit,
 * and report overflow so the caller can scroll it.
 *
 * Split from the painting so a scrolling note measures once and repaints per
 * frame — `measureText` is not free and a note is not retranslated at 60Hz.
 */
export function measureNote(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Rect,
  options: NoteOptions = {},
): NoteLayout {
  const padding = options.padding ?? 14;
  const family = options.font ?? NOTE_FONT;
  const innerW = box.w - padding * 2;
  const innerH = box.h - padding * 2;

  let fontSize = options.fontSize ?? 22;
  let lineHeight = options.lineHeight ?? fontSize * 1.25;
  const lines: string[] = [];

  ctx.font = fontFor(fontSize, family);
  wrapText(ctx, text, innerW, lines);
  if (lines.length * lineHeight > innerH) {
    fontSize = Math.max(10, fontSize * NOTE_SHRINK);
    lineHeight = (options.lineHeight ?? fontSize * 1.25) * (options.lineHeight ? NOTE_SHRINK : 1);
    ctx.font = fontFor(fontSize, family);
    wrapText(ctx, text, innerW, lines);
  }
  const contentHeight = lines.length * lineHeight;
  return { lines, fontSize, lineHeight, contentHeight, overflow: contentHeight > innerH };
}

/** Paint an already-measured layout, clipped to the card and optionally scrolled. */
export function paintNote(
  ctx: CanvasRenderingContext2D,
  layout: NoteLayout,
  box: Rect,
  palette: BumPalette,
  options: NoteOptions = {},
): void {
  const padding = options.padding ?? 14;
  const family = options.font ?? NOTE_FONT;
  const innerH = box.h - padding * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x + padding, box.y + padding, box.w - padding * 2, innerH);
  ctx.clip();

  // The scroll wraps with a blank gap so the text does not run into itself.
  const span = layout.contentHeight + layout.lineHeight * 1.5;
  const offset = layout.overflow ? -(((options.scrollPx ?? 0) % span) + span) % span : 0;

  ctx.font = fontFor(layout.fontSize, family);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = options.color ?? palette.ink;
  for (let pass = 0; pass < (layout.overflow ? 2 : 1); pass++) {
    const base = box.y + padding + offset + pass * span;
    for (let i = 0; i < layout.lines.length; i++) {
      const y = base + i * layout.lineHeight;
      if (y > box.y + box.h || y + layout.lineHeight < box.y) continue;
      ctx.fillText(layout.lines[i], box.x + padding, y);
    }
  }
  ctx.restore();
}

/** Measure and paint in one call — the baked path, where nothing scrolls yet. */
export function drawNote(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Rect,
  palette: BumPalette,
  options: NoteOptions = {},
): NoteLayout {
  const layout = measureNote(ctx, text, box, options);
  paintNote(ctx, layout, box, palette, options);
  return layout;
}

/** The card the note is written on: paper, a tilt, and a strip of tape. */
export function drawNoteCard(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  ctx.fillStyle = withAlpha(palette.paperEdge, 0.6);
  ctx.fillRect(box.x + 3, box.y + 4, box.w, box.h);
  ctx.fillStyle = mixColor(palette.paper, palette.highlight, 0.35);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  SX[0] = box.x;
  SY[0] = box.y;
  SX[1] = box.x + box.w;
  SY[1] = box.y;
  SX[2] = box.x + box.w;
  SY[2] = box.y + box.h;
  SX[3] = box.x;
  SY[3] = box.y + box.h;
  inkStroke(ctx, SX, SY, 4, {
    width: 2,
    color: withAlpha(palette.ink, 0.5),
    graphite: false,
    closed: true,
    boil,
    salt,
    amplitude: boil.world * 0.7,
  });
  ctx.fillStyle = palette.tape;
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y);
  ctx.rotate(-0.08);
  ctx.fillRect(-30, -10, 60, 20);
  ctx.restore();
}

// ─── Decorations ────────────────────────────────────────────────────────────

function drawArrowDecoration(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const o: StrokeOptions = {
    width: 5,
    color: withAlpha(palette.ink, 0.7),
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  // A drawn arrow bows; a straight one reads as a UI chevron.
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  SX[0] = from.x;
  SY[0] = from.y;
  SX[1] = mx - dy * 0.12;
  SY[1] = my + dx * 0.12;
  SX[2] = to.x;
  SY[2] = to.y;
  inkStroke(ctx, SX, SY, 3, o);

  const angle = Math.atan2(dy, dx);
  const head = 22;
  inkLine(
    ctx,
    to.x,
    to.y,
    to.x - Math.cos(angle - 0.5) * head,
    to.y - Math.sin(angle - 0.5) * head,
    o,
  );
  inkLine(
    ctx,
    to.x,
    to.y,
    to.x - Math.cos(angle + 0.5) * head,
    to.y - Math.sin(angle + 0.5) * head,
    o,
  );
}

/** Margin doodles. A small named vocabulary; unknown sprites draw a squiggle. */
function drawDoodle(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  scale: number,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const o: StrokeOptions = {
    width: 3,
    color: withAlpha(palette.ink, 0.6),
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  const r = 20 * scale;
  switch (sprite) {
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        SX[i] = Math.cos(a) * rr;
        SY[i] = Math.sin(a) * rr;
      }
      inkStroke(ctx, SX, SY, 10, { ...o, closed: true });
      break;
    }
    case 'spiral': {
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 5;
        const rr = (r * i) / n;
        SX[i] = Math.cos(a) * rr;
        SY[i] = Math.sin(a) * rr;
      }
      inkStroke(ctx, SX, SY, n, o);
      break;
    }
    case 'cloud': {
      for (let i = 0; i < 4; i++)
        inkArc(ctx, (i - 1.5) * r * 0.6, 0, r * 0.5, Math.PI, Math.PI * 2, o, 8);
      inkLine(ctx, -r * 1.1, 0, r * 1.1, 0, o);
      break;
    }
    case 'exclaim': {
      inkLine(ctx, 0, -r, 0, r * 0.35, { ...o, width: 5 });
      inkArc(ctx, 0, r * 0.8, 3, 0, Math.PI * 2, { ...o, width: 4 }, 6);
      break;
    }
    default: {
      const n = 16;
      for (let i = 0; i < n; i++) {
        SX[i] = -r + (i / (n - 1)) * r * 2;
        SY[i] = Math.sin((i / (n - 1)) * Math.PI * 3) * r * 0.4;
      }
      inkStroke(ctx, SX, SY, n, o);
    }
  }
}

function drawDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: Decoration,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
  translate: (key: string) => string,
  liveNotes: LiveNote[],
): void {
  switch (decoration.kind) {
    case 'note': {
      const w = decoration.width ?? 300;
      const box: Rect = { x: decoration.at.x, y: decoration.at.y, w, h: w * 0.62 };
      const angle = -0.03;
      ctx.save();
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate(angle);
      ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
      drawNoteCard(ctx, box, palette, boil, salt);
      const text = translate(decoration.textKey);
      const layout = drawNote(ctx, text, box, palette);
      ctx.restore();
      // An overflowing note cannot live in a static bake — it has to scroll, so
      // it is handed back for the per-frame pass. This is the one place where a
      // translation can move work out of the bake and into the frame.
      if (layout.overflow) liveNotes.push({ box, text, angle, layout });
      break;
    }
    case 'doodle':
      ctx.save();
      ctx.translate(decoration.at.x, decoration.at.y);
      ctx.rotate(decoration.angle ?? 0);
      drawDoodle(ctx, decoration.sprite, decoration.scale ?? 1, palette, boil, salt);
      ctx.restore();
      break;
    case 'arrow':
      drawArrowDecoration(ctx, decoration.from, decoration.to, palette, boil, salt);
      break;
    case 'stain': {
      ctx.fillStyle = withAlpha(mixColor(palette.paperEdge, palette.ink, 0.35), 0.16);
      ctx.beginPath();
      ctx.arc(decoration.at.x, decoration.at.y, decoration.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

// ─── The bake ───────────────────────────────────────────────────────────────

function makeLayer(bounds: Rect, scale: number): BakeLayer | null {
  const surface = createSurface(Math.ceil(bounds.w * scale), Math.ceil(bounds.h * scale));
  if (!surface) return null;
  surface.ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
  return {
    surface,
    scale,
    originX: bounds.x,
    originY: bounds.y,
    worldW: bounds.w,
    worldH: bounds.h,
  };
}

/** The bake scale for a level: the device wants `density`, memory caps it. */
export function bakeScaleFor(bounds: Rect, density: number): number {
  const area = Math.max(1, bounds.w * bounds.h);
  const byMemory = Math.sqrt(MAX_BAKE_PIXELS / area);
  return Math.max(0.25, Math.min(density, byMemory));
}

/**
 * Bake a level's static layers. Called once per level, and again only when the
 * device pixel ratio or the palette changes — never per frame, and never per
 * camera move.
 */
export function bakeWorld(
  level: Level,
  palette: BumPalette,
  boil: BoilField,
  options: BakeOptions,
): WorldBake {
  const bounds = level.bounds;
  const scale = bakeScaleFor(bounds, options.density);
  const under = makeLayer(bounds, scale);
  const over = makeLayer(bounds, scale);
  const liveNotes: LiveNote[] = [];
  const translate = options.translate ?? ((key: string) => key);
  const levelSalt = saltFromId(level.id);

  const propsById = new Map<string, Prop>();
  for (const prop of level.props) propsById.set(prop.id, prop);
  const hazardsById = new Map<string, Hazard>();
  for (const hazard of level.hazards) hazardsById.set(hazard.id, hazard);

  if (under) {
    const ctx = under.surface.ctx;
    drawSheetFurniture(ctx, level, palette, boil);

    // Layer 1 — the pencil under-drawing. Deliberately NOT aligned with the ink
    // that follows: an under-drawing that matches is invisible, and the whole
    // point is that someone sketched it, then inked it slightly differently.
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < level.geometry.length; i++) {
      const piece = level.geometry[i];
      const salt = vertexId(levelSalt, i * 97);
      ctx.save();
      ctx.translate(-3, 2);
      ctx.rotate(0.004);
      drawUnderDrawing(ctx, piece.shape, palette, boil, salt);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Layer 2 — the world ink.
    for (let i = 0; i < level.geometry.length; i++) {
      drawGeometry(
        ctx,
        level.geometry[i],
        palette,
        options.patterns,
        boil,
        options.density,
        vertexId(levelSalt, i * 31),
      );
    }
    for (const hazard of level.hazards) {
      drawHazardBody(ctx, hazard, palette, boil, saltFromId(hazard.id));
    }
    for (const [index, checkpoint] of level.checkpoints.entries()) {
      drawCheckpoint(
        ctx,
        checkpoint.at,
        checkpoint.optional === true,
        palette,
        boil,
        levelSalt + index,
      );
    }
    drawGoal(ctx, level.goal.shape, palette, boil, levelSalt);
  }

  if (over) {
    const ctx = over.surface.ctx;
    // Layer 5 — in-world chrome. The highlighter wash over the goal and the
    // assist beams sits *above* the actors on purpose: a highlighter drawn over
    // a figure is exactly what a highlighter does to a drawing, and it keeps
    // the guidance visible when four heads are piled on the goal.
    for (const beam of level.assistBeams) {
      drawAssistBeam(ctx, beam, palette);
    }
    for (const [index, decoration] of level.decorations.entries()) {
      drawDecoration(
        ctx,
        decoration,
        palette,
        boil,
        vertexId(levelSalt, 1000 + index * 13),
        translate,
        liveNotes,
      );
    }
  }

  return {
    under,
    over,
    propsById,
    hazardsById,
    liveNotes,
    dispose(): void {
      releaseSurface(under?.surface ?? null);
      releaseSurface(over?.surface ?? null);
    },
  };
}

function drawUnderDrawing(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const o: StrokeOptions = {
    width: 2,
    color: palette.graphite,
    graphite: false,
    alpha: 0.6,
    boil,
    salt,
    amplitude: boil.world * 1.6,
  };
  if (shape.kind === 'circle') {
    inkArc(ctx, shape.x, shape.y, shape.r, 0, Math.PI * 2, o, 16);
    return;
  }
  const n = shapePoints(shape);
  inkStroke(ctx, SX, SY, n, { ...o, closed: shape.kind !== 'chain' });
}

function drawCheckpoint(
  ctx: CanvasRenderingContext2D,
  at: Vec2,
  optional: boolean,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  // A folded paper flag on a pin. Optional (assist) checkpoints are dashed, so
  // the assist is visible rather than secret (§6.4).
  const o: StrokeOptions = {
    width: 3,
    color: optional ? withAlpha(palette.ink, 0.45) : palette.ink,
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  inkLine(ctx, at.x, at.y, at.x, at.y - 64, o);
  SX[0] = at.x;
  SY[0] = at.y - 64;
  SX[1] = at.x + 44;
  SY[1] = at.y - 52;
  SX[2] = at.x;
  SY[2] = at.y - 40;
  inkPolygon(ctx, SX, SY, 3, {
    ...o,
    fill: palette.highlight,
    fillComposite: 'multiply',
    fillAlpha: optional ? 0.4 : 1,
  });
}

function drawGoal(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const b = shapeBounds(shape, BOUNDS_SCRATCH);
  ctx.fillStyle = withAlpha(palette.highlight, 0.5);
  ctx.fillRect(b.x, b.y, b.w, b.h);
  const o: StrokeOptions = {
    width: 4,
    color: palette.ink,
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  if (shape.kind === 'circle') inkArc(ctx, shape.x, shape.y, shape.r, 0, Math.PI * 2, o, 20);
  else {
    const n = shapePoints(shape);
    inkStroke(ctx, SX, SY, n, { ...o, closed: true });
  }
}

function drawAssistBeam(ctx: CanvasRenderingContext2D, shape: Shape, palette: BumPalette): void {
  const b = shapeBounds(shape, BOUNDS_SCRATCH);
  ctx.globalCompositeOperation = isDarkPaper(palette) ? 'screen' : 'multiply';
  ctx.fillStyle = withAlpha(palette.highlight, 0.4);
  if (shape.kind === 'circle') {
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawHazardBody(
  ctx: CanvasRenderingContext2D,
  hazard: Hazard,
  palette: BumPalette,
  boil: BoilField,
  salt: number,
): void {
  const o: StrokeOptions = {
    width: 3,
    color: palette.danger,
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  switch (hazard.kind) {
    case 'spikes': {
      const b = shapeBounds(hazard.shape, BOUNDS_SCRATCH);
      const teeth = Math.max(2, Math.round(b.w / 26));
      let n = 0;
      for (let i = 0; i <= teeth && n < SHAPE_MAX - 2; i++) {
        SX[n] = b.x + (i * b.w) / teeth;
        SY[n] = b.y + b.h;
        n++;
        if (i < teeth) {
          SX[n] = b.x + ((i + 0.5) * b.w) / teeth;
          SY[n] = b.y;
          n++;
        }
      }
      inkStroke(ctx, SX, SY, n, o);
      break;
    }
    case 'void':
    case 'heat':
    case 'crumble':
    case 'wind': {
      // Static hazard bodies are outlined torn, because torn means "this hurts".
      const shape = hazard.shape;
      if (shape.kind === 'circle') inkArc(ctx, shape.x, shape.y, shape.r, 0, Math.PI * 2, o, 20);
      else {
        const n = shapePoints(shape);
        inkStroke(ctx, SX, SY, n, { ...o, closed: shape.kind !== 'chain' });
      }
      break;
    }
    default:
      // Lasers, saws and crushers are live — `drawHazard` handles them.
      break;
  }
}

// ─── The live pass ──────────────────────────────────────────────────────────

/** A cut-out box centred on the prop's transform — the shared prop chassis. */
function cutoutBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: BumPalette,
  patterns: PatternCache,
  boil: BoilField,
  density: number,
  salt: number,
  materialFill = true,
): void {
  ctx.fillStyle = withAlpha(palette.paperEdge, 0.75);
  ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  SX[0] = -w / 2;
  SY[0] = -h / 2;
  SX[1] = w / 2;
  SY[1] = -h / 2;
  SX[2] = w / 2;
  SY[2] = h / 2;
  SX[3] = -w / 2;
  SY[3] = h / 2;
  inkPolygon(ctx, SX, SY, 4, {
    width: 3,
    color: palette.ink,
    graphiteColor: palette.graphite,
    fill: materialFill ? patterns.get(ctx, 'crosshatch', palette.ink, density) : palette.paper,
    fillComposite: materialFill ? (isDarkPaper(palette) ? 'screen' : 'multiply') : 'source-over',
    boil,
    salt,
    amplitude: boil.world,
  });
}

/**
 * Draw one live prop.
 *
 * The vocabulary is deliberately small: most props are a cut-out box or a
 * pinned bar with one identifying glyph. A prop the player has to *use* gets a
 * distinct silhouette; a prop that is just mass does not, because twenty-five
 * bespoke prop drawings is twenty-five things to keep looking like one hand
 * drew them.
 */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  render: RenderProp,
  authored: Prop | undefined,
  palette: BumPalette,
  patterns: PatternCache,
  boil: BoilField,
  density: number,
): void {
  const salt = saltFromId(render.id);
  ctx.save();
  ctx.translate(render.at.x, render.at.y);
  ctx.rotate(render.angle);

  const stroke: StrokeOptions = {
    width: 3,
    color: palette.ink,
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  const sized = authored && 'size' in authored ? authored.size : null;
  const w = sized ? sized.x : 64;
  const h = sized ? sized.y : 64;

  switch (render.kind) {
    case 'crate':
    case 'platformMoving':
    case 'platformFalling':
    case 'door':
    case 'conveyor':
    case 'trampoline':
    case 'plate':
    case 'zeroG':
    case 'fan':
      cutoutBox(ctx, w, h, palette, patterns, boil, density, salt, render.kind !== 'zeroG');
      break;
    case 'button':
      cutoutBox(ctx, w, render.active ? h * 0.5 : h, palette, patterns, boil, density, salt, false);
      break;
    case 'lever':
    case 'swing': {
      const length = authored && 'length' in authored ? authored.length : 100;
      inkLine(ctx, 0, 0, 0, length, { ...stroke, width: 6, widthEnd: 3 });
      drawPinAt(ctx, 0, 0, palette);
      break;
    }
    case 'rope': {
      const segments = authored && 'segments' in authored ? authored.segments : 8;
      const n = Math.min(segments + 1, SHAPE_MAX);
      for (let i = 0; i < n; i++) {
        SX[i] = 0;
        SY[i] = i * PHYSICS.ARM_SEG_LENGTH * 1.4;
      }
      inkStroke(ctx, SX, SY, n, { ...stroke, width: 5, widthEnd: 4 });
      break;
    }
    case 'key':
    case 'relic':
    case 'parcel':
      inkCircle(
        ctx,
        0,
        0,
        18,
        { ...stroke, fill: palette.highlight, fillComposite: 'multiply' },
        12,
      );
      inkLine(ctx, 0, 18, 0, 34, stroke);
      break;
    case 'magnet':
    case 'popCannon':
    case 'thruster':
    case 'skiLift':
    case 'rescueDrone':
    case 'camera':
    case 'paperweight':
    case 'stretchInk':
    case 'poseOutline':
    case 'signalRelay':
    default:
      cutoutBox(ctx, w, h, palette, patterns, boil, density, salt, false);
      break;
  }

  // Progress, when the sim publishes it, is a fill along the bottom edge — the
  // one prop overlay that means the same thing on every prop.
  if (render.progress !== undefined && render.progress > 0) {
    ctx.fillStyle = withAlpha(palette.highlight, 0.8);
    ctx.fillRect(-w / 2, h / 2 - 5, w * Math.min(1, render.progress), 4);
  }
  ctx.restore();
}

function drawPinAt(ctx: CanvasRenderingContext2D, x: number, y: number, palette: BumPalette): void {
  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  inkArc(ctx, x, y, 7, 0, Math.PI * 2, { width: 2.2, color: palette.ink, graphite: false }, 10);
}

/** The cycling hazards — lasers, saws, crushers — drawn from live state. */
export function drawHazard(
  ctx: CanvasRenderingContext2D,
  state: RenderState['hazards'][number],
  authored: Hazard | undefined,
  palette: BumPalette,
  boil: BoilField,
): void {
  if (!authored) return;
  const salt = saltFromId(authored.id);
  const active = state.active;
  const o: StrokeOptions = {
    width: active ? 5 : 2,
    color: active ? palette.danger : withAlpha(palette.danger, 0.35),
    graphiteColor: palette.graphite,
    boil,
    salt,
    amplitude: boil.world,
  };
  switch (authored.kind) {
    case 'laser':
      inkLine(ctx, authored.from.x, authored.from.y, authored.to.x, authored.to.y, o);
      break;
    case 'saw': {
      const teeth = 12;
      const spin = (state.progress ?? 0) * Math.PI * 2;
      for (let i = 0; i < teeth; i++) {
        const a = spin + (i / teeth) * Math.PI * 2;
        SX[i] = authored.at.x + Math.cos(a) * authored.r * (i % 2 === 0 ? 1 : 0.72);
        SY[i] = authored.at.y + Math.sin(a) * authored.r * (i % 2 === 0 ? 1 : 0.72);
      }
      inkStroke(ctx, SX, SY, teeth, { ...o, closed: true });
      break;
    }
    case 'crusher': {
      const b = shapeBounds(authored.shape, BOUNDS_SCRATCH);
      SX[0] = b.x;
      SY[0] = b.y;
      SX[1] = b.x + b.w;
      SY[1] = b.y;
      SX[2] = b.x + b.w;
      SY[2] = b.y + b.h;
      SX[3] = b.x;
      SY[3] = b.y + b.h;
      inkStroke(ctx, SX, SY, 4, { ...o, closed: true });
      break;
    }
    default:
      break;
  }
}

/**
 * Blit the visible slice of a baked layer. Called with the world transform
 * active, so source and destination are both expressed in world units and the
 * browser does one clipped scale — no per-frame canvas allocation, no clearing.
 */
export function blitLayer(
  ctx: CanvasRenderingContext2D,
  layer: BakeLayer | null,
  viewX: number,
  viewY: number,
  viewW: number,
  viewH: number,
): void {
  if (!layer) return;
  const x0 = Math.max(viewX, layer.originX);
  const y0 = Math.max(viewY, layer.originY);
  const x1 = Math.min(viewX + viewW, layer.originX + layer.worldW);
  const y1 = Math.min(viewY + viewH, layer.originY + layer.worldH);
  if (x1 <= x0 || y1 <= y0) return;

  const sx = (x0 - layer.originX) * layer.scale;
  const sy = (y0 - layer.originY) * layer.scale;
  const sw = (x1 - x0) * layer.scale;
  const sh = (y1 - y0) * layer.scale;
  ctx.drawImage(layer.surface.canvas, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
}
