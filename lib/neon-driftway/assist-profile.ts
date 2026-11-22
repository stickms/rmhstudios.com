/**
 * Neon Driftway: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides at run start which runs are assisted
 * (`POST /api/games/neon-driftway/assist-run`, through `startAssistRun`) and hands the
 * profile back; this file maps it onto the engine's and the renderer's levers so the
 * mapping reads and tests without a canvas.
 *
 *   speedFloor    scales the simulation's step, so the road comes at the player
 *                 slower (single-player only: a race clock is shared)
 *   calmVisuals   no crash flash, no camera shake, no head bob, no lightning, no
 *                 speed streaks, no headlight flicker, bloom capped and steady
 *   colorSafe     boost pads carry chevrons and hazards carry stripes, in a pair
 *                 that does not depend on red against green
 *
 * Online races honour the two visual assists locally and never the clock
 * (sprint 08's co-op decision). Hold to press and no timed input do not apply:
 * the car has no tap input and no reaction window to extend.
 *
 * Assists only remove effects. Nothing here adds a frame loop or idle motion.
 */

import type { AssistProfile, AssistSettings } from '@/lib/game/assist';

export interface NdwAssistFlags {
  active: boolean;
  /** Fraction of real time the simulation runs at, 0.5-1. Always 1 online. */
  speedScale: number;
  calm: boolean;
  colorSafe: boolean;
}

export const NO_NDW_ASSIST: NdwAssistFlags = {
  active: false,
  speedScale: 1,
  calm: false,
  colorSafe: false,
};

/** A ranked profile (or none) is the plain game. Online races never get the speed floor. */
export function ndwAssistFlags(
  profile: AssistProfile | null | undefined,
  opts: { multiplayer?: boolean } = {},
): NdwAssistFlags {
  if (!profile || profile.ranked) return NO_NDW_ASSIST;
  return {
    active: true,
    speedScale: opts.multiplayer ? 1 : Math.min(1, Math.max(0.5, profile.speedFloor)),
    calm: profile.calmVisuals,
    colorSafe: profile.colorSafe,
  };
}

/**
 * Online races: only the two visual assists, read from the member's stored settings. A race
 * makes no run-start claim (its results never reach a board), so nothing here can unrank a
 * later solo run, and the shared clock keeps its normal pace.
 */
export function ndwOnlineFlags(
  settings: Pick<AssistSettings, 'calmVisuals' | 'colorSafe'> | null | undefined,
): NdwAssistFlags {
  if (!settings || (!settings.calmVisuals && !settings.colorSafe)) return NO_NDW_ASSIST;
  return { active: true, speedScale: 1, calm: settings.calmVisuals, colorSafe: settings.colorSafe };
}

/** The simulation step under the speed floor. */
export function scaledStep(dt: number, flags: NdwAssistFlags): number {
  return dt * flags.speedScale;
}

/** The camera shake a collision asks for, after calm visuals. */
export function shakeMagnitudeFor(magnitude: number, flags: NdwAssistFlags): number {
  return flags.calm ? 0 : magnitude;
}

/** Brightness of the crash flash (0-1 of its normal level). */
export function crashFlashScale(flags: NdwAssistFlags): number {
  return flags.calm ? 0 : 1;
}

/** Whether the storm level's lightning may flash. */
export function lightningAllowed(flags: NdwAssistFlags, reducedMotion: boolean): boolean {
  return !reducedMotion && !flags.calm;
}

/** Whether the headlights may flicker on the night level. */
export function headlightFlickerAllowed(flags: NdwAssistFlags): boolean {
  return !flags.calm;
}

/** Whether speed streaks and head bob (screen-wide motion) are drawn. */
export function motionEffectsAllowed(flags: NdwAssistFlags, reducedMotion: boolean): boolean {
  return !reducedMotion && !flags.calm;
}

/** The most bloom a calm run ever shows. The normal range is 0.45 to 1.2. */
export const CALM_BLOOM_CAP = 0.3;

/** Bloom strength the renderer eases towards, after calm visuals caps it. */
export function bloomTargetFor(target: number, flags: NdwAssistFlags): number {
  return flags.calm ? Math.min(target, CALM_BLOOM_CAP) : target;
}

/**
 * The colour-safe pair (Okabe-Ito blue and orange): distinct for every common colour vision
 * type, and each also carries a shape, so neither is told apart by hue alone.
 */
export const COLOR_SAFE_BOOST = '#0072b2';
export const COLOR_SAFE_HAZARD = '#e69f00';
/** Hazards are drawn on near-black so the stripe holds 3:1 against it. */
export const COLOR_SAFE_HAZARD_DARK = '#1a1a1a';

/** The marking shape each kind of track object carries when colour-safe is on. */
export const COLOR_SAFE_SHAPES = {
  boost: 'chevron',
  hazard: 'stripe',
} as const;
