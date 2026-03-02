// =============================================================================
// ALTAIR ENGINE -- Sprite Animator
// =============================================================================
// Frame-based animation system for sprite sheets. Each animation is a sequence
// of frame indices with a fixed duration per frame.
// =============================================================================

import type { SpriteSheet } from './sprite-loader';

/** A named animation sequence. */
export interface SpriteAnimation {
  sheet: SpriteSheet;
  /** Frame indices into the sprite sheet (left-to-right, top-to-bottom). */
  frames: number[];
  /** Seconds per frame. */
  frameDuration: number;
  loop: boolean;
}

/** Runtime state for an active animation. */
export interface AnimationState {
  animation: SpriteAnimation;
  currentFrame: number;
  elapsed: number;
  finished: boolean;
}

/** A set of directional + idle animations for a character/enemy. */
export interface EntitySpriteSet {
  idle: SpriteAnimation;
  walkDown: SpriteAnimation;
  walkUp: SpriteAnimation;
  walkSide: SpriteAnimation; // right-facing; flip for left
}

/** Create a fresh animation state for a given animation. */
export function createAnimState(animation: SpriteAnimation): AnimationState {
  return {
    animation,
    currentFrame: 0,
    elapsed: 0,
    finished: false,
  };
}

/** Advance the animation by `dt` seconds. */
export function updateAnimation(state: AnimationState, dt: number): void {
  if (state.finished) return;

  state.elapsed += dt;
  const { frameDuration, frames, loop } = state.animation;

  while (state.elapsed >= frameDuration) {
    state.elapsed -= frameDuration;
    state.currentFrame++;

    if (state.currentFrame >= frames.length) {
      if (loop) {
        state.currentFrame = 0;
      } else {
        state.currentFrame = frames.length - 1;
        state.finished = true;
        break;
      }
    }
  }
}

/** Get the current frame index from the sprite sheet. */
export function getCurrentFrameIndex(state: AnimationState): number {
  return state.animation.frames[state.currentFrame] ?? 0;
}

/**
 * Get the source rectangle for drawImage() from a frame index.
 * Frames are numbered left-to-right, top-to-bottom.
 */
export function getFrameRect(
  sheet: SpriteSheet,
  frameIndex: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const col = frameIndex % sheet.cols;
  const row = Math.floor(frameIndex / sheet.cols);
  return {
    sx: col * sheet.frameWidth,
    sy: row * sheet.frameHeight,
    sw: sheet.frameWidth,
    sh: sheet.frameHeight,
  };
}

/**
 * Pick the right directional animation based on velocity and return
 * whether the sprite should be horizontally flipped.
 */
export function pickDirectionalAnim(
  sprites: EntitySpriteSet,
  vx: number,
  vy: number,
  isMoving: boolean,
): { animation: SpriteAnimation; flipX: boolean } {
  if (!isMoving) {
    return { animation: sprites.idle, flipX: false };
  }

  const absX = Math.abs(vx);
  const absY = Math.abs(vy);

  // Prefer horizontal if it dominates, otherwise vertical
  if (absX > absY) {
    return { animation: sprites.walkSide, flipX: vx < 0 };
  } else if (vy > 0) {
    return { animation: sprites.walkDown, flipX: false };
  } else {
    return { animation: sprites.walkUp, flipX: false };
  }
}
