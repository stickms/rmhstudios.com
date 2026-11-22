/**
 * Dream Rift: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides which runs are assisted at run start
 * (`POST /api/games/dream-rift/assist-run`); this file maps the profile it hands
 * back onto the engine's levers so the mapping reads and tests without a canvas.
 *
 *   speedFloor    scales the fixed-step clock: fewer sim frames per real second.
 *                 The sim, its patterns and the RNG are untouched, so the seeded
 *                 daily is the same sequence of events, only slower.
 *   noTimedInput  graze radius widens to the easiest tier's and the death-bomb
 *                 window lengthens
 *   calmVisuals   no full-screen flash (a faint fade at most) and no additive
 *                 hit-flash blend
 *   colorSafe     every bullet also carries a dashed ring chosen by its colour, so
 *                 colour is never the only cue
 *   holdToPress   shot is automatic and focus is a toggle
 *
 * Co-op shares one simulation between up to four players, so only the two
 * presentational assists apply there, locally ({@link dreamRiftCoopFlags}).
 */

import type { AssistProfile, AssistSettings } from '@/lib/game/assist';
import type { InputFrame } from './types';
import type { BulletColorName } from './render/palette';
import { DIFFICULTY } from './constants';

export interface DreamRiftAssistFlags {
  /** A gameplay assist is on: the run is assisted (and unranked). False for co-op's local-only flags. */
  active: boolean;
  /** Sim frames advance at this fraction of real time. */
  clockScale: number;
  calm: boolean;
  colorSafe: boolean;
  /** Held fire is automatic; focus toggles. */
  holdToggle: boolean;
  untimed: boolean;
}

export const NO_ASSIST_FLAGS: DreamRiftAssistFlags = {
  active: false,
  clockScale: 1,
  calm: false,
  colorSafe: false,
  holdToggle: false,
  untimed: false,
};

/** Solo, practice and the seeded daily: every assist. A ranked profile (or none) is the plain game. */
export function dreamRiftAssistFlags(profile: AssistProfile | null | undefined): DreamRiftAssistFlags {
  if (!profile || profile.ranked) return NO_ASSIST_FLAGS;
  return {
    active: true,
    clockScale: Math.min(1, Math.max(0.5, profile.speedFloor)),
    calm: profile.calmVisuals,
    colorSafe: profile.colorSafe,
    holdToggle: profile.holdToPress,
    untimed: profile.noTimedInput,
  };
}

/**
 * Co-op: the shared sim runs at full speed for everyone, so only what this
 * player's own screen draws changes. `active` stays false: no claim is made and
 * the co-op score path is unchanged.
 */
export function dreamRiftCoopFlags(
  settings: Pick<AssistSettings, 'calmVisuals' | 'colorSafe'> | null | undefined,
): DreamRiftAssistFlags {
  if (!settings) return NO_ASSIST_FLAGS;
  return {
    ...NO_ASSIST_FLAGS,
    calm: settings.calmVisuals,
    colorSafe: settings.colorSafe,
  };
}

/**
 * Advance the fixed-step accumulator by `dtMs` real milliseconds. Scaling the
 * time that feeds the accumulator is the whole of speedFloor: the sim still
 * steps in whole 60 Hz frames, in the same order, drawing the same RNG values.
 */
export function advanceClock(acc: number, dtMs: number, flags: DreamRiftAssistFlags): number {
  return acc + dtMs * flags.clockScale;
}

/** Slowest-tier graze radius (the largest of the four difficulties). */
export const UNTIMED_GRAZE_RADIUS = Math.max(...Object.values(DIFFICULTY).map((d) => d.grazeRadius));

/** Death-bomb window in sim frames under no-timed-input (the base window is 8). */
export const UNTIMED_DEATHBOMB_FRAMES = 24;

export function grazeRadiusFor(flags: DreamRiftAssistFlags): number {
  return flags.untimed ? UNTIMED_GRAZE_RADIUS : 0;
}

export function deathbombFramesFor(flags: DreamRiftAssistFlags): number {
  return flags.untimed ? UNTIMED_DEATHBOMB_FRAMES : 0;
}

/** The strongest screen flash calm visuals allows: a faint fade, never a strobe. */
export const CALM_FLASH_CAP = 0.1;

export function flashAmountFor(amount: number, flags: DreamRiftAssistFlags): number {
  return flags.calm ? Math.min(amount, CALM_FLASH_CAP) : amount;
}

/** Whether enemies and bosses draw the additive hit-flash blend. */
export function hitFlashBlend(flags: DreamRiftAssistFlags): boolean {
  return !flags.calm;
}

/** Dash pattern (px) of the ring a bullet carries under colour-safe; empty = solid. */
export const BULLET_RING_DASH: Readonly<Record<BulletColorName, readonly number[]>> = {
  red: [],
  orange: [6, 3],
  yellow: [2, 3],
  green: [10, 4],
  mint: [6, 3, 2, 3],
  cyan: [3, 6],
  blue: [12, 3, 2, 3],
  indigo: [2, 8],
  purple: [14, 5],
  magenta: [4, 2, 4, 6],
  white: [8, 2, 2, 2],
};

/**
 * Hold-to-press: shot is always on (auto-fire), and the focus key toggles on
 * each fresh press instead of being held. `state` carries the toggle between
 * frames and is the only thing this mutates. Returns a new frame; the input
 * manager's own frame is never changed.
 */
export interface HoldState {
  focusOn: boolean;
  focusWasDown: boolean;
}

export function applyHoldToggle(frame: InputFrame, state: HoldState, flags: DreamRiftAssistFlags): InputFrame {
  if (!flags.holdToggle) return frame;
  if (frame.focus && !state.focusWasDown) state.focusOn = !state.focusOn;
  state.focusWasDown = frame.focus;
  return {
    ...frame,
    shot: true,
    focus: state.focusOn,
  };
}
