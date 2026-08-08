/**
 * Material fill patterns — the accessibility feature that looks like decoration.
 *
 * Solid areas in this game are never flat: every surface is filled with one of
 * six repeating scribbles, chosen by its {@link MaterialId}. That means grip is
 * readable **in monochrome** — the rubber ledge is visibly a different mark
 * from the greasy one, before colour, before any HUD. §2.3 calls the fills
 * decoration and §2.8 calls them an accessibility commitment; they are the same
 * pixels.
 *
 * Each pattern is baked once into a small tile and reused as a `CanvasPattern`,
 * composited at `multiply` so it darkens the paper rather than covering it.
 * Inverted worlds (Marker Mosh, and any level whose palette makes the sheet
 * darker than the ink) composite at `screen` instead — multiply over near-black
 * paper draws nothing at all.
 *
 * The tiles are seamless by construction, not by blur: the line families have
 * periods that divide the tile edge, and the loose marks are inset so nothing
 * straddles a seam.
 */

import { MATERIALS } from '../constants';
import type { MaterialId } from '../types';
import { createSurface, releaseSurface, type Surface } from './paper';
import { withAlpha, type BumPalette } from './theme';

export type PatternId = 'crosshatch' | 'stipple' | 'thin' | 'streak' | 'broken' | 'wash';

/** Tile edge in design px. 32 divides by every line period used below. */
const TILE = 32;

/** The material → pattern mapping, straight out of `MATERIALS` so it cannot drift. */
export function materialPatternId(material: MaterialId): PatternId {
  return MATERIALS[material].pattern;
}

/** Deterministic generator — a pattern must be the same marks on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hairline(ctx: CanvasRenderingContext2D, w: number): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
}

/** Diagonals in both directions — the default "this is solid" hatch. */
function drawCrosshatch(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.strokeStyle = withAlpha(color, 0.34);
  hairline(ctx, 1.1);
  const step = 8;
  for (let k = -TILE; k <= TILE * 2; k += step) {
    ctx.beginPath();
    ctx.moveTo(k, -TILE);
    ctx.lineTo(k + TILE * 2, TILE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k, TILE * 2);
    ctx.lineTo(k + TILE * 2, 0);
    ctx.stroke();
  }
}

/** Dot stipple — rubber. Dense, round, grippy-looking. */
function drawStipple(ctx: CanvasRenderingContext2D, color: string): void {
  const random = rng(0x5eed01);
  ctx.fillStyle = withAlpha(color, 0.42);
  for (let i = 0; i < 90; i++) {
    const r = 0.7 + random() * 0.9;
    const x = r + random() * (TILE - r * 2);
    const y = r + random() * (TILE - r * 2);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Sparse horizontal hairlines — ice. Almost nothing to hold onto, and it looks it. */
function drawThin(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.strokeStyle = withAlpha(color, 0.26);
  hairline(ctx, 0.9);
  for (let y = 4; y < TILE; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TILE, y);
    ctx.stroke();
  }
}

/** Marker streaks — grease. Wide, uneven, smeared along one axis. */
function drawStreak(ctx: CanvasRenderingContext2D, color: string): void {
  const random = rng(0x5eed02);
  for (let y = 2; y < TILE; y += 8) {
    const alpha = 0.18 + random() * 0.3;
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.fillRect(0, y, TILE, 2.2 + random() * 2);
    ctx.fillStyle = withAlpha(color, alpha * 0.5);
    ctx.fillRect(0, y + 3.4, TILE, 1);
  }
}

/** Short broken dashes at scattered angles — crumbly. Reads as "about to give". */
function drawBroken(ctx: CanvasRenderingContext2D, color: string): void {
  const random = rng(0x5eed03);
  ctx.strokeStyle = withAlpha(color, 0.4);
  hairline(ctx, 1.4);
  for (let i = 0; i < 26; i++) {
    const len = 3 + random() * 5;
    const angle = random() * Math.PI;
    const x = 4 + random() * (TILE - 8);
    const y = 4 + random() * (TILE - 8);
    const dx = (Math.cos(angle) * len) / 2;
    const dy = (Math.sin(angle) * len) / 2;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  }
}

/** A flat wash with two faint bands — nogrip. Deliberately featureless. */
function drawWash(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = withAlpha(color, 0.14);
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = withAlpha(color, 0.08);
  ctx.fillRect(0, 6, TILE, 3);
  ctx.fillRect(0, 22, TILE, 2);
}

const DRAW: Readonly<Record<PatternId, (ctx: CanvasRenderingContext2D, color: string) => void>> = {
  crosshatch: drawCrosshatch,
  stipple: drawStipple,
  thin: drawThin,
  streak: drawStreak,
  broken: drawBroken,
  wash: drawWash,
};

interface Entry {
  readonly surface: Surface;
  readonly pattern: CanvasPattern | null;
}

/**
 * Bake-and-hold for the pattern tiles.
 *
 * Keyed on (pattern, colour, density) because a world tint changes the ink and
 * a resize changes the density, and both must re-bake. Bounded so a level that
 * somehow asks for many variants cannot grow the cache without limit; eviction
 * is oldest-first, which is right when the working set is six.
 */
export class PatternCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly limit = 24) {}

  /**
   * A repeating pattern for `id` in `color`, sized so one tile covers `TILE`
   * units of the current transform.
   *
   * `density` is device px per design px; the tile is baked at that resolution
   * and the pattern scaled back down, so the marks stay crisp on a 2× screen.
   */
  get(
    ctx: CanvasRenderingContext2D,
    id: PatternId,
    color: string,
    density: number,
  ): CanvasPattern | null {
    // Quantise so a continuous resize does not bake a new tile per pixel.
    const d = Math.max(0.5, Math.min(3, Math.round(density * 2) / 2));
    const key = `${id}|${color}|${d}`;
    const hit = this.entries.get(key);
    if (hit) return hit.pattern;

    const size = Math.max(1, Math.round(TILE * d));
    const surface = createSurface(size, size);
    if (!surface) return null;
    surface.ctx.setTransform(d, 0, 0, d, 0, 0);
    DRAW[id](surface.ctx, color);
    surface.ctx.setTransform(1, 0, 0, 1, 0, 0);

    const pattern = ctx.createPattern(surface.canvas, 'repeat');
    if (pattern && typeof DOMMatrix !== 'undefined' && d !== 1) {
      const k = 1 / d;
      pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    }

    if (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        releaseSurface(this.entries.get(oldest.value)?.surface ?? null);
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, { surface, pattern });
    return pattern;
  }

  /** The pattern for a material, in the palette's ink. */
  forMaterial(
    ctx: CanvasRenderingContext2D,
    material: MaterialId,
    palette: BumPalette,
    density: number,
  ): CanvasPattern | null {
    return this.get(ctx, materialPatternId(material), palette.ink, density);
  }

  dispose(): void {
    for (const entry of this.entries.values()) releaseSurface(entry.surface);
    this.entries.clear();
  }
}
