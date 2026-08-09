/**
 * Layer 0 — the sheet.
 *
 * Paper base, fibre noise, the ruled grid, the red margin line, coffee rings,
 * and the spiral binding down the left edge. Everything here is either baked
 * once into a repeating tile or drawn once into the level's world bake; none of
 * it is per-frame work.
 *
 * The split is deliberate. The base + fibre + rules **repeat**, so they are one
 * small tile turned into a `CanvasPattern` and used to fill whatever slice of
 * the world the camera can see — two fills a frame, at any level size. The
 * margin, the rings and the binding **do not** repeat: they belong to a
 * specific place on a specific sheet, so they go into the world bake with the
 * pencil and the ink (`worldbake.ts`), which is blitted, not tiled.
 *
 * This file also owns {@link createSurface}, the one place an offscreen canvas
 * is made, because every baked layer in this directory is a sheet of paper by
 * another name.
 */

import type { Level } from '../types';
import { inkArc, inkLine, inkStroke } from './ink';
import { mixColor, withAlpha, type BumPalette } from './theme';
import { saltFromId, type BoilField } from './boil';

/** Ruled-line spacing in design px. The tile height is a whole multiple of it. */
export const RULE_SPACING = 36;
/** Tile edge in design px — eight ruled lines, big enough that the fibre reads as random. */
export const PAPER_TILE = RULE_SPACING * 8;
/** Where the red margin sits, measured in from the sheet's left edge. */
export const MARGIN_INSET = 132;

export interface Surface {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
}

/**
 * Allocate an offscreen drawing surface.
 *
 * `OffscreenCanvas` where it exists (no DOM node, and the browser is free to
 * keep the backing store off the main thread's heap); a detached `<canvas>`
 * otherwise. The single cast below is the price of the two context types being
 * structurally identical for everything this pipeline calls but nominally
 * distinct in lib.dom — better one documented cast here than a union type
 * threaded through every drawing function.
 */
export function createSurface(width: number, height: number): Surface | null {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;
    return ctx ? { canvas, ctx, width: w, height: h } : null;
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx, width: w, height: h } : null;
  }
  // No canvas anywhere: SSR, or a unit test. The renderer treats a missing
  // surface as "this layer does not exist" rather than throwing, so the pure
  // geometry can still be exercised without a DOM.
  return null;
}

/** Release a surface's memory. Safari in particular holds onto big canvases. */
export function releaseSurface(surface: Surface | null): void {
  if (!surface) return;
  const canvas = surface.canvas;
  // Shrinking to 1×1 is the only portable way to hand a canvas's backing store
  // back; `OffscreenCanvas` is collected normally and needs nothing.
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    canvas.width = 1;
    canvas.height = 1;
  }
}

/** A tiny deterministic generator — the fibre must be the same sheet every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PaperTileOptions {
  /**
   * Device pixels per design px to bake the tile at. The tile is drawn at this
   * resolution and the pattern is scaled back down, so the fibre stays crisp on
   * a 2× phone instead of being a magnified 1× bitmap.
   */
  density: number;
  /** Graph paper — vertical rules as well as horizontal (World 7, §6.6). */
  grid?: boolean;
  /** Seed for the fibre; the level id, so two worlds are not the same sheet. */
  seed?: number;
}

export interface PaperTile {
  readonly surface: Surface;
  readonly density: number;
}

/**
 * Bake the repeating part of the sheet: fibre specks and ruled lines on
 * transparent, so the pattern can be laid over whatever paper colour the level
 * tinted to without re-baking when the tint changes.
 */
export function bakePaperTile(palette: BumPalette, options: PaperTileOptions): PaperTile | null {
  const density = Math.max(0.5, Math.min(3, options.density));
  const size = Math.round(PAPER_TILE * density);
  const surface = createSurface(size, size);
  if (!surface) return null;
  const { ctx } = surface;
  ctx.setTransform(density, 0, 0, density, 0, 0);

  // Fibre: single-pixel specks at very low alpha. Inset by one design px so no
  // speck straddles the tile edge and shows the seam.
  const random = rng(options.seed ?? 0x1a2b3c4d);
  const fibreDark = withAlpha(mixColor(palette.paper, palette.ink, 0.5), 0.07);
  const fibreLight = withAlpha(mixColor(palette.paper, palette.paperEdge, 0.9), 0.12);
  const speckSize = 1 / density;
  for (let i = 0; i < 900; i++) {
    const x = 1 + random() * (PAPER_TILE - 2);
    const y = 1 + random() * (PAPER_TILE - 2);
    ctx.fillStyle = random() < 0.65 ? fibreDark : fibreLight;
    ctx.fillRect(x, y, speckSize * 1.6, speckSize * 1.6);
  }

  // Ruled lines. Hairlines at the tile's own resolution — a tapered ink stroke
  // here would cost more and read as a drawn line, and these are printed.
  ctx.lineWidth = 1 / density;
  ctx.strokeStyle = withAlpha(palette.rule, 0.55);
  for (let y = RULE_SPACING; y <= PAPER_TILE; y += RULE_SPACING) {
    const at = y - 0.5 / density;
    ctx.beginPath();
    ctx.moveTo(0, at);
    ctx.lineTo(PAPER_TILE, at);
    ctx.stroke();
  }
  if (options.grid) {
    ctx.strokeStyle = withAlpha(palette.rule, 0.4);
    for (let x = RULE_SPACING; x <= PAPER_TILE; x += RULE_SPACING) {
      const at = x - 0.5 / density;
      ctx.beginPath();
      ctx.moveTo(at, 0);
      ctx.lineTo(at, PAPER_TILE);
      ctx.stroke();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { surface, density };
}

/**
 * Turn a baked tile into a pattern in *world* units.
 *
 * The tile was baked at `density` device px per design px, so the pattern is
 * scaled by `1/density` to put one tile back on `PAPER_TILE` world units. Where
 * `DOMMatrix` is missing the tile is used unscaled — slightly soft, never
 * wrong-sized, and no browser that can run this game is in that branch.
 */
export function paperPattern(
  ctx: CanvasRenderingContext2D,
  tile: PaperTile | null,
): CanvasPattern | null {
  if (!tile) return null;
  const pattern = ctx.createPattern(tile.surface.canvas, 'repeat');
  if (!pattern) return null;
  if (typeof DOMMatrix !== 'undefined' && tile.density !== 1) {
    const k = 1 / tile.density;
    pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  }
  return pattern;
}

/**
 * Fill a world-space rectangle with paper. Two fills: the flat tint, then the
 * fibre-and-rules pattern over it. Called once a frame with the visible world
 * rect, which is why the pattern exists instead of a level-sized bake.
 */
export function drawPaperBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: BumPalette,
  pattern: CanvasPattern | null,
): void {
  ctx.fillStyle = palette.paper;
  ctx.fillRect(x, y, w, h);
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
}

/**
 * The parts of the sheet that belong to one place on it: the margin line, the
 * coffee rings, the spiral binding and the sheet edge. Drawn once into the
 * level's world bake.
 */
export function drawSheetFurniture(
  ctx: CanvasRenderingContext2D,
  level: Level,
  palette: BumPalette,
  boil: BoilField,
): void {
  const { x, y, w, h } = level.bounds;
  const salt = saltFromId(level.id);
  const random = rng(salt);

  // The margin: one long red line down the sheet, drawn with a ruler by someone
  // who was not concentrating, so it wobbles like everything else.
  const marginX = x + MARGIN_INSET;
  inkLine(ctx, marginX, y, marginX, y + h, {
    width: 2.2,
    color: withAlpha(palette.margin, 0.85),
    graphite: false,
    boil,
    salt: salt + 1,
    amplitude: boil.world * 0.6,
  });

  // Coffee rings: one to three, never over the margin, never in the top-left
  // where the binding is. Two concentric arcs with a gap reads as a ring far
  // better than a full ellipse does.
  const ringColor = withAlpha(mixColor(palette.paperEdge, palette.ink, 0.3), 0.22);
  const rings = 1 + Math.floor(random() * 3);
  for (let i = 0; i < rings; i++) {
    const rx = x + MARGIN_INSET + random() * Math.max(1, w - MARGIN_INSET - 200) + 100;
    const ry = y + 160 + random() * Math.max(1, h - 320);
    const radius = 90 + random() * 70;
    const start = random() * Math.PI * 2;
    inkArc(ctx, rx, ry, radius, start, start + Math.PI * 1.7, {
      width: 7,
      color: ringColor,
      graphite: false,
      boil,
      salt: salt + 20 + i * 7,
      amplitude: boil.world * 1.5,
    });
    inkArc(ctx, rx, ry, radius * 0.86, start + 0.4, start + Math.PI * 1.3, {
      width: 3,
      color: ringColor,
      graphite: false,
      boil,
      salt: salt + 40 + i * 7,
      amplitude: boil.world * 1.5,
    });
  }

  // Sheet edge: a soft darkening at all four borders, so the level reads as a
  // piece of paper lying on a desk rather than an infinite plane.
  const edge = withAlpha(palette.paperEdge, 0.55);
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 3);
  ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillRect(x, y, 3, h);
  ctx.fillRect(x + w - 3, y, 3, h);

  // Spiral binding: punched holes down the left edge with the wire looping
  // through them. Ends before the bottom margin so it doesn't collide with the
  // sheet edge line.
  const holeSpacing = 96;
  const holeX = x + 44;
  const wire = withAlpha(palette.graphite, 0.7);
  for (let hy = y + holeSpacing * 0.7; hy < y + h - holeSpacing * 0.5; hy += holeSpacing) {
    ctx.beginPath();
    ctx.arc(holeX, hy, 11, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(palette.paperEdge, 0.9);
    ctx.fill();
    inkArc(ctx, holeX, hy, 11, 0, Math.PI * 2, {
      width: 2,
      color: withAlpha(palette.ink, 0.35),
      graphite: false,
    });
    // The wire loop: over the top edge of the sheet and back down through the
    // hole, which is what makes it read as a spiral and not a row of dots.
    WIRE_X[0] = holeX - 14;
    WIRE_Y[0] = hy + 16;
    WIRE_X[1] = x - 6;
    WIRE_Y[1] = hy - 6;
    WIRE_X[2] = holeX + 2;
    WIRE_Y[2] = hy - 16;
    inkStroke(ctx, WIRE_X, WIRE_Y, 3, {
      width: 4,
      color: wire,
      graphite: false,
      boil,
      salt: salt + Math.round(hy),
      amplitude: boil.world * 0.5,
    });
  }
}

const WIRE_X = new Float64Array(3);
const WIRE_Y = new Float64Array(3);
