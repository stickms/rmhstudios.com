/**
 * Laundry Sort — procedural fabric weaves and bin decals.
 *
 * Every wash colour also carries a **weave**, and that is an accessibility
 * requirement rather than decoration: a game whose only rule is "match the
 * colour" is unplayable for a red/green colour-blind player. The weave is
 * printed on the cloth *and* on the bin it belongs in, so the rule can be read
 * entirely without hue.
 *
 * Both are drawn to a `<canvas>` at module use time rather than shipped as
 * image assets — a 64px tile costs nothing to generate, works offline, needs no
 * font loading, and localises for free (bin labels are drawn from already
 * translated strings).
 */

import * as THREE from 'three';
import type { WeaveId } from '@/lib/laundry-sort/constants';

const TILE = 64;

/**
 * Greyscale tile, multiplied over the garment's base colour. Values stay in a
 * narrow band (0.72–1.0) so the weave reads as woven texture, not as paint.
 */
function drawWeave(ctx: CanvasRenderingContext2D, weave: WeaveId): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';

  switch (weave) {
    case 'solid': {
      // Not truly flat: a faint twill keeps the plain colour from looking
      // like untextured plastic under the sheen.
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      for (let i = -TILE; i < TILE * 2; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + TILE, TILE);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.stroke();
      }
      break;
    }
    case 'stripe': {
      for (let y = 0; y < TILE; y += 16) ctx.fillRect(0, y, TILE, 8);
      break;
    }
    case 'check': {
      for (let y = 0; y < TILE; y += 16) {
        for (let x = 0; x < TILE; x += 16) {
          if (((x / 16) & 1) === ((y / 16) & 1)) ctx.fillRect(x, y, 16, 16);
        }
      }
      break;
    }
    case 'dot': {
      for (let y = 8; y < TILE; y += 16) {
        for (let x = 8; x < TILE; x += 16) {
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
}

/** Draw the weave as a solid glyph — used on bin decals, where it must read big. */
export function drawWeaveGlyph(
  ctx: CanvasRenderingContext2D,
  weave: WeaveId,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  switch (weave) {
    case 'solid':
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'stripe':
      for (let i = -1; i <= 1; i++)
        ctx.fillRect(cx - r, cy + i * (r * 0.66) - r * 0.16, r * 2, r * 0.33);
      break;
    case 'check':
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          if ((gx + gy) % 2 === 0) ctx.fillRect(cx - r + gx * r, cy - r + gy * r, r, r);
        }
      }
      break;
    case 'dot':
      for (const [ox, oy] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + ox * r, cy + oy * r, r * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** One repeating fabric tile per weave. Built lazily, then cached. */
const weaveCache = new Map<WeaveId, THREE.Texture | null>();

export function weaveTexture(weave: WeaveId): THREE.Texture | null {
  const cached = weaveCache.get(weave);
  if (cached !== undefined) return cached;

  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas?.getContext('2d') ?? null;
  if (!canvas || !ctx) {
    weaveCache.set(weave, null);
    return null;
  }

  drawWeave(ctx, weave);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 2.5);
  texture.anisotropy = 4;
  weaveCache.set(weave, texture);
  return texture;
}

/**
 * Front-panel decal for a bin: the weave glyph over the wash colour, with the
 * already-translated label under it. Cached per label so a locale switch
 * rebuilds them and nothing else does.
 */
const decalCache = new Map<string, THREE.Texture | null>();

export function binDecalTexture(label: string, weave: WeaveId, hex: string): THREE.Texture | null {
  const key = `${label}|${weave}|${hex}`;
  const cached = decalCache.get(key);
  if (cached !== undefined) return cached;

  const width = 256;
  const height = 128;
  const canvas = makeCanvas(width, height);
  const ctx = canvas?.getContext('2d') ?? null;
  if (!canvas || !ctx) {
    decalCache.set(key, null);
    return null;
  }

  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);
  // A dark scrim under the glyph and text so both stay legible on the lighter
  // wash colours (golds especially) as well as the darker ones.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, width, height);

  drawWeaveGlyph(ctx, weave, width / 2, 46, 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase().slice(0, 14), width / 2, 100);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  decalCache.set(key, texture);
  return texture;
}

/** Drop every cached texture — called when the locale changes. */
export function clearDecalCache(): void {
  for (const texture of decalCache.values()) texture?.dispose();
  decalCache.clear();
}
