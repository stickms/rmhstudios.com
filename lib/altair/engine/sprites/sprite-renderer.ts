// =============================================================================
// ALTAIR ENGINE -- Sprite Renderer
// =============================================================================
// Low-level helpers for drawing sprites to a Canvas 2D context. Handles
// scaling, flipping, and pixel-perfect rendering for crisp results on any
// resolution, including mobile.
//
// PERF: imageSmoothingEnabled is set once per frame in renderFrame(). These
// helpers avoid ctx.save/restore unless a transform (flipX) is needed.
// =============================================================================

import type { SpriteSheet } from './sprite-loader';
import type { AnimationState } from './sprite-animator';
import { getCurrentFrameIndex, getFrameRect } from './sprite-animator';

/**
 * Draw a single frame from a sprite sheet.
 *
 * @param ctx    Canvas context
 * @param sheet  The loaded sprite sheet
 * @param frameIndex  Frame number (0-based, LTR then TTB)
 * @param x      Center X on canvas (screen coords)
 * @param y      Center Y on canvas (screen coords)
 * @param scale  Pixel multiplier (e.g. 2 = draw 16px sprite at 32px)
 * @param flipX  Mirror horizontally (for left-facing)
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false,
): void {
  if (!sheet.loaded) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);

  if (flipX) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet.image, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(sheet.image, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

/**
 * Draw the current frame of an animated sprite.
 */
export function drawAnimatedSprite(
  ctx: CanvasRenderingContext2D,
  state: AnimationState,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false,
): void {
  const frameIndex = getCurrentFrameIndex(state);
  drawSprite(ctx, state.animation.sheet, frameIndex, x, y, scale, flipX);
}

/**
 * Draw a tile from a tileset sprite sheet at a grid-aligned position.
 * Unlike entity sprites, tiles are positioned at their top-left corner.
 */
export function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  tileIndex: number,
  x: number,
  y: number,
  tileSize: number,
): void {
  if (!sheet.loaded) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, tileIndex);
  ctx.drawImage(
    sheet.image,
    sx, sy, sw, sh,
    Math.round(x), Math.round(y), tileSize, tileSize,
  );
}

/**
 * Draw a grayed-out corpse sprite using offscreen compositing.
 * Desaturates the sprite by overlaying gray, then draws at reduced opacity.
 */
let corpseCanvas: OffscreenCanvas | null = null;
let corpseCtx: OffscreenCanvasRenderingContext2D | null = null;

export function drawSpriteCorpse(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  alpha: number,
  flipX: boolean = false,
): void {
  if (!sheet.loaded) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const iw = Math.ceil(dw);
  const ih = Math.ceil(dh);

  // Lazily create (or resize) the offscreen corpse canvas
  if (!corpseCanvas || corpseCanvas.width < iw || corpseCanvas.height < ih) {
    corpseCanvas = new OffscreenCanvas(iw, ih);
    corpseCtx = corpseCanvas.getContext('2d')!;
  }
  const cc = corpseCtx!;

  // Draw sprite, then overlay gray via source-atop to desaturate
  cc.clearRect(0, 0, iw, ih);
  cc.imageSmoothingEnabled = false;
  cc.globalCompositeOperation = 'source-over';
  cc.globalAlpha = 1;
  cc.drawImage(sheet.image, sx, sy, sw, sh, 0, 0, iw, ih);
  cc.globalCompositeOperation = 'source-atop';
  cc.globalAlpha = 0.6;
  cc.fillStyle = '#444444';
  cc.fillRect(0, 0, iw, ih);

  // Blit to main canvas with fade-out alpha
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (flipX) {
    ctx.translate(dx + iw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(corpseCanvas, 0, 0, iw, ih, 0, 0, iw, ih);
  } else {
    ctx.drawImage(corpseCanvas, 0, 0, iw, ih, dx, dy, iw, ih);
  }
  ctx.restore();
}

/**
 * Draw a sprite with a flash-white overlay (for hit feedback).
 * Uses an offscreen canvas to composite the white silhouette without
 * affecting the main canvas composite mode.
 */
let flashCanvas: OffscreenCanvas | null = null;
let flashCtx: OffscreenCanvasRenderingContext2D | null = null;

export function drawSpriteFlash(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false,
): void {
  if (!sheet.loaded) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const iw = Math.ceil(dw);
  const ih = Math.ceil(dh);

  // Lazily create (or resize) the offscreen flash canvas
  if (!flashCanvas || flashCanvas.width < iw || flashCanvas.height < ih) {
    flashCanvas = new OffscreenCanvas(iw, ih);
    flashCtx = flashCanvas.getContext('2d')!;
  }
  const fc = flashCtx!;

  // Draw sprite into offscreen canvas, then overlay white via source-atop
  fc.clearRect(0, 0, iw, ih);
  fc.imageSmoothingEnabled = false;
  fc.globalCompositeOperation = 'source-over';
  fc.globalAlpha = 1;
  fc.drawImage(sheet.image, sx, sy, sw, sh, 0, 0, iw, ih);
  fc.globalCompositeOperation = 'source-atop';
  fc.globalAlpha = 0.7;
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, iw, ih);

  // Blit the flash result to the main canvas (centered)
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);
  if (flipX) {
    ctx.save();
    ctx.translate(dx + iw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(flashCanvas, 0, 0, iw, ih, 0, 0, iw, ih);
    ctx.restore();
  } else {
    ctx.drawImage(flashCanvas, 0, 0, iw, ih, dx, dy, iw, ih);
  }
}
