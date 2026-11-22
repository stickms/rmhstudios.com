/**
 * Laundry Sort: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides at run start which solo runs are assisted
 * (`POST /api/games/laundry-sort/assist-run`) and hands the profile back; this file maps it
 * onto the two levers the game has.
 *
 *   colorSafe     every garment colour also carries a bold pattern glyph, on the garment and
 *                 on its bin, so no sort depends on hue (a level can be solved in greyscale)
 *   noTimedInput  a solo match runs without the clock: the HUD shows "Untimed" and the player
 *                 ends it with "Finish"
 *
 * Calm visuals and hold to press do not apply: the scene has no flash or shake to remove and
 * dragging is not a quick-tap input. A versus round's clock is shared, so online play takes
 * colour-safe only, read locally from the member's settings.
 *
 * Imports nothing from the solver or the scene, so the match can read it.
 */

import type { AssistProfile, AssistSettings } from '@/lib/game/assist';
import { WASH_COLORS, type WeaveId } from './constants';

export interface LaundryAssistFlags {
  active: boolean;
  colorSafe: boolean;
  /** A solo match with no clock, ended by the player. */
  untimed: boolean;
}

export const NO_LAUNDRY_ASSIST: LaundryAssistFlags = {
  active: false,
  colorSafe: false,
  untimed: false,
};

/** A ranked profile (or none) is the plain game. */
export function laundryAssistFlags(profile: AssistProfile | null | undefined): LaundryAssistFlags {
  if (!profile || profile.ranked) return NO_LAUNDRY_ASSIST;
  const colorSafe = profile.colorSafe;
  const untimed = profile.noTimedInput;
  if (!colorSafe && !untimed) return NO_LAUNDRY_ASSIST;
  return { active: true, colorSafe, untimed };
}

/** Versus: colour-safe only. The round's clock is shared, so it stays. */
export function laundryVersusFlags(settings: Pick<AssistSettings, 'colorSafe'> | null | undefined): LaundryAssistFlags {
  if (!settings?.colorSafe) return NO_LAUNDRY_ASSIST;
  return { active: true, colorSafe: true, untimed: false };
}

/** The glyph a wash colour carries: one distinct shape per colour, the same on garment, bin and legend. */
export function glyphFor(colorIndex: number): WeaveId {
  return (WASH_COLORS[colorIndex] ?? WASH_COLORS[0]).weave;
}

/** Seconds of garments an untimed match is dealt. Long enough that the player, not the schedule, ends it. */
export const UNTIMED_SCHEDULE_SEC = 300;

/** Does a match with these flags end when its clock runs out? */
export function endsOnTime(flags: Pick<LaundryAssistFlags, 'untimed'>): boolean {
  return !flags.untimed;
}
