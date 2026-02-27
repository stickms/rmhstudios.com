// =============================================================================
// ALTAIR ENGINE -- Sprite Renderer
// =============================================================================
// Low-level helpers for drawing sprites to a Canvas 2D context. Handles
// scaling, flipping, and pixel-perfect rendering for crisp results on any
// resolution, including mobile.
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
  // Use Math.round for pixel-perfect positioning on all DPRs
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);

  ctx.save();
  // Disable smoothing for crisp pixel art
  ctx.imageSmoothingEnabled = false;

  if (flipX) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet.image, sx, sy, sw, sh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(sheet.image, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  ctx.restore();
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

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet.image,
    sx, sy, sw, sh,
    Math.round(x), Math.round(y), tileSize, tileSize,
  );
  ctx.restore();
}

/**
 * Draw a sprite with a flash-white overlay (for hit feedback).
 * Draws the sprite normally, then overlays a white silhouette using
 * composite operations.
 */
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

  // Draw base sprite
  drawSprite(ctx, sheet, frameIndex, x, y, scale, flipX);

  // Overlay white using an offscreen trick: draw sprite, then fill white
  // with source-atop to only color the opaque pixels
  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.7;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
}
