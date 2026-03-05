// =============================================================================
// ALTAIR ENGINE -- Sprite Renderer (WebGL)
// =============================================================================
// Low-level helpers for drawing sprites via the WebGL sprite batch. Handles
// scaling, flipping, and pixel-perfect rendering. All functions push quads into
// the SpriteBatch which flushes them in batched draw calls.
//
// Flash & corpse effects are achieved via tint color modulation in the shader,
// eliminating the need for offscreen Canvas 2D compositing.
// =============================================================================

import type { SpriteSheet } from './sprite-loader';
import type { AnimationState } from './sprite-animator';
import { getCurrentFrameIndex, getFrameRect } from './sprite-animator';
import type { SpriteBatch } from '../webgl/webgl-sprite-batch';
import { getGLContext, getContextGeneration, createTextureFromImage } from '../webgl/webgl-textures';

/**
 * Ensure a sprite sheet has a GL texture for the current context.
 * Recreates the texture if the GL context has changed since it was created.
 */
function ensureTexture(sheet: SpriteSheet): WebGLTexture | null {
  const gen = getContextGeneration();
  if (sheet.glTexture && sheet.glTextureGeneration === gen) return sheet.glTexture;
  // Texture is missing or from a stale context — (re)create it
  const gl = getGLContext();
  if (!gl || !sheet.loaded) return null;
  sheet.glTexture = createTextureFromImage(gl, sheet.image);
  sheet.glTextureGeneration = gen;
  return sheet.glTexture;
}

/**
 * Draw a single frame from a sprite sheet.
 */
export function drawSprite(
  batch: SpriteBatch,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false,
): void {
  if (!sheet.loaded) return;
  const tex = ensureTexture(sheet);
  if (!tex) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);

  batch.drawQuad(
    tex,
    sx, sy, sw, sh,
    sheet.image.naturalWidth, sheet.image.naturalHeight,
    dx, dy, dw, dh,
    1, 1, 1, 1,
    flipX,
  );
}

/**
 * Draw the current frame of an animated sprite.
 */
export function drawAnimatedSprite(
  batch: SpriteBatch,
  state: AnimationState,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false,
): void {
  const frameIndex = getCurrentFrameIndex(state);
  drawSprite(batch, state.animation.sheet, frameIndex, x, y, scale, flipX);
}

/**
 * Draw a tile from a tileset sprite sheet at a grid-aligned position.
 */
export function drawTileSprite(
  batch: SpriteBatch,
  sheet: SpriteSheet,
  tileIndex: number,
  x: number,
  y: number,
  tileSize: number,
): void {
  if (!sheet.loaded) return;
  const tex = ensureTexture(sheet);
  if (!tex) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, tileIndex);
  batch.drawQuad(
    tex,
    sx, sy, sw, sh,
    sheet.image.naturalWidth, sheet.image.naturalHeight,
    Math.round(x), Math.round(y), tileSize, tileSize,
    1, 1, 1, 1,
    false,
  );
}

/**
 * Draw a grayed-out corpse sprite. Achieved by tinting to gray with fading alpha.
 */
export function drawSpriteCorpse(
  batch: SpriteBatch,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  alpha: number,
  flipX: boolean = false,
): void {
  if (!sheet.loaded) return;
  const tex = ensureTexture(sheet);
  if (!tex) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);

  // Gray desaturation via tint (dark gray color tint)
  batch.drawQuad(
    tex,
    sx, sy, sw, sh,
    sheet.image.naturalWidth, sheet.image.naturalHeight,
    dx, dy, dw, dh,
    0.4, 0.4, 0.4, alpha,
    flipX,
  );
}

/**
 * Draw a sprite with a flash-white overlay (for hit feedback).
 * The white tint replaces sprite colors by tinting toward white.
 */
export function drawSpriteFlash(
  batch: SpriteBatch,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false,
): void {
  if (!sheet.loaded) return;
  const tex = ensureTexture(sheet);
  if (!tex) return;

  const { sx, sy, sw, sh } = getFrameRect(sheet, frameIndex);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh / 2);

  // Draw base sprite
  batch.drawQuad(
    tex,
    sx, sy, sw, sh,
    sheet.image.naturalWidth, sheet.image.naturalHeight,
    dx, dy, dw, dh,
    1, 1, 1, 1,
    flipX,
  );

  // Draw white overlay on top (additive-like effect via high tint with alpha)
  batch.drawQuad(
    tex,
    sx, sy, sw, sh,
    sheet.image.naturalWidth, sheet.image.naturalHeight,
    dx, dy, dw, dh,
    3.0, 3.0, 3.0, 0.7,
    flipX,
  );
}
