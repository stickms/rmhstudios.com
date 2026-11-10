/**
 * Per-frame mutable state shared by the camera rig, the avatar and the input handlers. It lives outside React
 * and the store on purpose: it changes every frame, and nothing here should ever cause a re-render. The
 * store holds what the HUD needs to react to (which view is wanted); this holds how far along we are.
 */

import type { AvatarState } from './avatar';
import type { ViewKind } from './camera';

export interface Runtime {
  /** 0 = isometric, 1 = third-person; moves toward the store's requested view each frame. */
  progress: number;
  avatar: AvatarState;
  /** Avatar height above the world origin, eased so stepping up or down a block is never a snap. */
  avatarY: number;
  /** Ground point the isometric camera looks at, and how far back it sits. */
  isoCenter: { x: number; z: number };
  isoDistance: number;
  /** Where the third-person camera is facing (follows the avatar's yaw with a lag). */
  camYaw: number;
  /** Raw movement intent from keys/stick: forward and right in [-1,1], relative to the camera. */
  input: { forward: number; right: number; run: boolean };
  /** Seconds the avatar has been walking, driving the limb phase. */
  gaitPhase: number;
  /** Which view we last asked for (to detect a toggle). */
  lastView: ViewKind;
}

export function createRuntime(spawn: { x: number; z: number }): Runtime {
  return {
    progress: 0,
    avatar: { x: spawn.x, z: spawn.z, yaw: 0.8, speed: 0 },
    avatarY: 0,
    isoCenter: { x: spawn.x, z: spawn.z },
    isoDistance: 150,
    camYaw: 0.8,
    input: { forward: 0, right: 0, run: false },
    gaitPhase: 0,
    lastView: 'iso',
  };
}

/** Rotate camera-relative intent into the world-space direction `stepAvatar` wants. */
export function cameraRelativeMove(
  input: { forward: number; right: number },
  camYaw: number,
): { x: number; z: number } {
  const f = Number.isFinite(input.forward) ? input.forward : 0;
  const r = Number.isFinite(input.right) ? input.right : 0;
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  // right = forward × up
  return { x: fx * f - Math.cos(camYaw) * r, z: fz * f + Math.sin(camYaw) * r };
}
