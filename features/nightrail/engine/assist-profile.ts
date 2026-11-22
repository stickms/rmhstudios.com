/**
 * Nightrail: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides which runs are assisted at run start
 * (`POST /api/games/nightrail/assist-run`); this file maps the profile it hands
 * back onto the engine's levers so the mapping reads and tests without a canvas.
 *
 *   speedFloor    caps the train's speed (target, boost cap and floor) at that
 *                 fraction of the level's, so the track comes at the player slower
 *   noTimedInput  a trick pressed up to {@link UNTIMED_TRICK_BUFFER} s before the
 *                 train leaves the ground still fires on take-off; a landing
 *                 forgives more unfinished rotation; the combo lives longer
 *   calmVisuals   no camera shake, crash flash, immunity blink or speed-line
 *                 streaks (the renderer reads this)
 *   colorSafe     freight and ceilings carry a pattern as well as a colour
 *                 (barriers already carry stripes; the renderer reads this)
 *   holdToPress   a held trick key (or stick) stands for a repeated tap
 *
 * This file imports nothing from the engine or the renderer, so the sim can read it.
 */

import type { AssistProfile } from '@/lib/game/assist';
import type { TrickDirection } from './types';

export interface NightrailAssistFlags {
  active: boolean;
  /** Fraction of the level's speed the train may reach, 0.5-1. */
  speedScale: number;
  calm: boolean;
  colorSafe: boolean;
  holdRepeat: boolean;
  untimed: boolean;
}

export const NO_ASSIST_FLAGS: NightrailAssistFlags = {
  active: false,
  speedScale: 1,
  calm: false,
  colorSafe: false,
  holdRepeat: false,
  untimed: false,
};

/** A ranked profile (or none) is the plain game. */
export function nightrailAssistFlags(profile: AssistProfile | null | undefined): NightrailAssistFlags {
  if (!profile || profile.ranked) return NO_ASSIST_FLAGS;
  return {
    active: true,
    speedScale: Math.min(1, Math.max(0.5, profile.speedFloor)),
    calm: profile.calmVisuals,
    colorSafe: profile.colorSafe,
    holdRepeat: profile.holdToPress,
    untimed: profile.noTimedInput,
  };
}

/** Seconds a trick pressed early is held for, under no-timed-input. */
export const UNTIMED_TRICK_BUFFER = 0.6;

/** Landing tolerance (radians of unfinished rotation) and combo grace multipliers. */
export const UNTIMED_TOLERANCE_SCALE = 1.6;
export const UNTIMED_GRACE_SCALE = 2;

export function trickBufferFor(flags: NightrailAssistFlags): number {
  return flags.untimed ? UNTIMED_TRICK_BUFFER : 0;
}

export function landingToleranceFor(base: number, flags: NightrailAssistFlags): number {
  return flags.untimed ? base * UNTIMED_TOLERANCE_SCALE : base;
}

export function comboGraceFor(base: number, flags: NightrailAssistFlags): number {
  return flags.untimed ? base * UNTIMED_GRACE_SCALE : base;
}

/** The level's speed ceiling or target under the cap. */
export function cappedSpeed(speed: number, flags: NightrailAssistFlags): number {
  return speed * flags.speedScale;
}

/**
 * The trick to feed the sim this frame: a fresh press always counts; a held
 * direction stands for a press on every frame under hold-to-press (the sim starts
 * one trick at a time, so this just starts the next as soon as the last lands).
 */
export function trickInput(
  fresh: TrickDirection | null,
  held: TrickDirection | null,
  flags: NightrailAssistFlags,
): TrickDirection | null {
  return fresh ?? (flags.holdRepeat ? held : null);
}
