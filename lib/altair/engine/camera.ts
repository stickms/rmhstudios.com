// =============================================================================
// ALTAIR ENGINE -- Camera System
// =============================================================================
// Smooth-follow camera with screen shake support.
// =============================================================================

import { Camera, PlayerEntity } from './types';

const CAMERA_LERP_SPEED = 5.0; // higher = snappier follow
const SHAKE_DECAY = 8.0; // how fast shake fades

/**
 * Create a new camera centered at the origin.
 */
export function createCamera(width: number, height: number): Camera {
  return {
    x: 0,
    y: 0,
    width,
    height,
    shakeX: 0,
    shakeY: 0,
    shakeIntensity: 0,
    shakeDuration: 0,
  };
}

/**
 * Smoothly follow the player with linear interpolation.
 * Also updates screen shake decay.
 */
export function updateCamera(
  camera: Camera,
  player: PlayerEntity,
  delta: number,
): void {
  // Lerp toward the player position
  const t = 1 - Math.exp(-CAMERA_LERP_SPEED * delta);
  camera.x += (player.x - camera.x) * t;
  camera.y += (player.y - camera.y) * t;

  // Update screen shake
  if (camera.shakeDuration > 0) {
    camera.shakeDuration -= delta;
    if (camera.shakeDuration <= 0) {
      camera.shakeDuration = 0;
      camera.shakeIntensity = 0;
      camera.shakeX = 0;
      camera.shakeY = 0;
    } else {
      // Decay intensity over time
      camera.shakeIntensity *= Math.exp(-SHAKE_DECAY * delta);
      // Random offset each frame
      const angle = Math.random() * Math.PI * 2;
      camera.shakeX = Math.cos(angle) * camera.shakeIntensity;
      camera.shakeY = Math.sin(angle) * camera.shakeIntensity;
    }
  }
}

/**
 * Trigger a screen shake effect.
 * If a shake is already running the stronger one wins.
 */
export function shakeCamera(
  camera: Camera,
  intensity: number,
  duration: number,
): void {
  if (intensity > camera.shakeIntensity) {
    camera.shakeIntensity = intensity;
  }
  if (duration > camera.shakeDuration) {
    camera.shakeDuration = duration;
  }
}

/**
 * Convert world coordinates to screen (canvas) coordinates.
 */
export function worldToScreen(
  camera: Camera,
  wx: number,
  wy: number,
): { x: number; y: number } {
  return {
    x: wx - camera.x + camera.width / 2 + camera.shakeX,
    y: wy - camera.y + camera.height / 2 + camera.shakeY,
  };
}

/**
 * Check whether a world position is visible on screen (with an extra margin
 * so that entities near the edge are still processed).
 */
export function isVisible(
  camera: Camera,
  wx: number,
  wy: number,
  margin: number,
): boolean {
  const halfW = camera.width / 2 + margin;
  const halfH = camera.height / 2 + margin;
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  return dx >= -halfW && dx <= halfW && dy >= -halfH && dy <= halfH;
}
