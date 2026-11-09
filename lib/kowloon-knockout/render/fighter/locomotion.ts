// ============================================================
// Locomotion: how a moving fighter should move.
//
// The sim only says "walking". On its own that plays one forward walk cycle at one speed, so a fighter
// backing off or circling looked like it was moonwalking, and a 6 m/s dash looked like a stroll. From the
// fighter's real velocity (relative to where it faces) this picks:
//   * the clip — walk forward, walk BACKWARD (the cycle played in reverse), or the sideways shuffle (Source
//     fighters have an authored one; the Y-Bot has none and walks),
//   * its speed — cadence matched to the ground speed so the feet don't skate,
//   * a lean into the movement.
// Pure, so it is tested without a renderer.
// ============================================================

import { clamp } from '@/lib/core/math';

/** Ground speed (m/s) at which the walk and strafe clips' own feet-speed matches the floor. */
export const WALK_REF_SPEED = 2.4;
export const STRAFE_REF_SPEED = 1.9;
/** Cadence limits: slower looks like treacle, faster like a blur (a fast dash leans instead). */
export const MIN_CADENCE = 0.6;
export const MAX_CADENCE = 2.1;
/** Below this speed (m/s) a fighter counts as standing. */
export const STAND_SPEED = 0.15;

export interface Locomotion {
    clip: 'walk' | 'strafe';
    /** Playback speed; negative = the cycle runs backward. */
    timeScale: number;
}

const cadence = (speed: number, ref: number) => clamp(speed / ref, MIN_CADENCE, MAX_CADENCE);

/**
 * `fwd`: velocity along the facing direction (m/s, + = forward). `lat`: velocity toward the character's left
 * (+ = left). `canStrafe`: the model has the sideways clip.
 */
export function locomotion(fwd: number, lat: number, canStrafe: boolean): Locomotion {
    const speed = Math.hypot(fwd, lat);
    if (!(speed > STAND_SPEED)) return { clip: 'walk', timeScale: 1 };
    if (canStrafe && Math.abs(lat) > Math.abs(fwd) * 1.1) {
        return { clip: 'strafe', timeScale: (lat >= 0 ? 1 : -1) * cadence(speed, STRAFE_REF_SPEED) };
    }
    // Mostly forward or back (or lateral on a model with no strafe clip, which just walks).
    const backward = fwd < 0 && Math.abs(fwd) >= Math.abs(lat) * 0.8;
    return { clip: 'walk', timeScale: (backward ? -1 : 1) * cadence(speed, WALK_REF_SPEED) };
}

export interface Lean { pitch: number; roll: number }

/** Largest lean (radians): forward 11°, back 6°, sideways 7°. */
const MAX_PITCH = 0.2, MIN_PITCH = -0.1, MAX_ROLL = 0.12;

/** Lean into the movement: forward into a dash, back when retreating, toward the side when strafing. */
export function leanFor(fwd: number, lat: number): Lean {
    return {
        pitch: clamp(fwd * 0.04, MIN_PITCH, MAX_PITCH),
        roll: clamp(-lat * 0.03, -MAX_ROLL, MAX_ROLL), // +X is the character's left; a roll about +Z leans toward -X, so negate
    };
}

/** How much of the procedural stance bounce to show for a fighter this still (1 = standing, 0 = moving). */
export function standingness(speed: number): number {
    return clamp(1 - (speed - STAND_SPEED) / 0.6, 0, 1);
}
