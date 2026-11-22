/**
 * Synapse Storm: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides which runs are assisted at run
 * start (`POST /api/games/synapse-storm/assist-run`); this file only maps the
 * profile it hands back onto the game's own levers, so the mapping can be read
 * and tested without a browser.
 *
 *   speedFloor    scales the game clock: puzzle timers drain, and the next
 *                 puzzle arrives, `speedFloor` times as fast
 *   noTimedInput  puzzle timers do not drain, so nothing expires; the run ends
 *                 when the player ends it
 *   calmVisuals   no flashing, pulsing or shaking effects; the one full-screen
 *                 colour state changes at most once a second
 *   colorSafe     every colour-coded state also carries a glyph or a word
 *   holdToPress   a held press stands in for repeated tapping
 *
 * Multiplayer matches run on a shared wall clock, so they never take a profile.
 */

import type { AssistProfile } from '@/lib/game/assist';

export interface SynapseAssistFlags {
  /** Any assist is on. */
  active: boolean;
  /** 1 = full speed; 0.5-1 otherwise. */
  clockScale: number;
  /** Puzzle timers do not drain; the player ends the run. */
  frozenTimers: boolean;
  calm: boolean;
  colorSafe: boolean;
  holdToPress: boolean;
}

export const NO_ASSIST_FLAGS: SynapseAssistFlags =
  {
    active: false,
    clockScale: 1,
    frozenTimers: false,
    calm: false,
    colorSafe: false,
    holdToPress: false,
  };

/** Minimum gap between changes of the one full-screen colour state under calm visuals. */
export const CALM_COLOR_GAP_MS = 1000;

/** A ranked profile (or none) is the plain game. */
export function synapseAssistFlags(
  profile:
    | AssistProfile
    | null
    | undefined,
): SynapseAssistFlags {
  if (
    !profile ||
    profile.ranked
  )
    return NO_ASSIST_FLAGS;
  return {
    active: true,
    clockScale:
      Math.min(
        1,
        Math.max(
          0.5,
          profile.speedFloor,
        ),
      ),
    frozenTimers:
      profile.noTimedInput,
    calm: profile.calmVisuals,
    colorSafe:
      profile.colorSafe,
    holdToPress:
      profile.holdToPress,
  };
}

/** Seconds a puzzle timer drains this tick, given the wall-clock seconds that passed. */
export function puzzleDrainSeconds(
  rawDt: number,
  flags: SynapseAssistFlags,
): number {
  if (
    flags.frozenTimers
  )
    return 0;
  return (
    rawDt *
    flags.clockScale
  );
}

/** The wait before the next spawn: a slower clock spaces puzzles further apart. */
export function spawnDelayMs(
  ms: number,
  flags: SynapseAssistFlags,
): number {
  return (
    ms /
    flags.clockScale
  );
}

/** The seconds of the run that count toward the difficulty ramp. */
export function rampSeconds(
  wallSeconds: number,
  flags: SynapseAssistFlags,
): number {
  return (
    wallSeconds *
    flags.clockScale
  );
}

/**
 * Whether a full-screen colour state may change now. Under calm visuals it may
 * change at most once per `CALM_COLOR_GAP_MS`; otherwise always.
 */
export function mayChangeScreenColor(
  lastChangeAt: number,
  now: number,
  flags: SynapseAssistFlags,
): boolean {
  if (
    !flags.calm
  )
    return true;
  return (
    now -
      lastChangeAt >=
    CALM_COLOR_GAP_MS
  );
}

/** The colours the colour puzzles use, each with a letter that survives without hue. */
const COLOR_GLYPHS: Record<
  string,
  string
> =
  {
    '#ff5252':
      'R',
    '#00e5ff':
      'C',
    '#76ff03':
      'G',
    '#ffab00':
      'A',
    '#b388ff':
      'V',
    '#ff6ec7':
      'P',
  };

/** A glyph for a puzzle colour, or an empty string for a colour the game does not use. */
export function colorGlyph(
  hex: string,
): string {
  return (
    COLOR_GLYPHS[
      hex.toLowerCase()
    ] ??
    ''
  );
}
