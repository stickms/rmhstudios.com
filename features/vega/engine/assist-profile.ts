/**
 * Project Vega: what an assist profile (`lib/game/assist.ts`) does to a run.
 *
 * Pure and client-safe. The server decides at run start which runs are assisted
 * (`POST /api/games/vega/assist-run`) and hands the profile back; this file maps it onto the four
 * levers the game has. The profile is read once per run, so the frame loop never looks anything up.
 *
 *   speedFloor    the run clock's normal speed becomes `speedFloor` x 1; the fast toggle stays 2x
 *   calmVisuals   no leak edge flash, no burst stains, no tower muzzle flashes or hit flashes
 *   colorSafe     the specimen and instrument palettes swap to a colour-blind-safe set, and every
 *                 specimen type also carries its own outline glyph, so no type depends on hue
 *   noTimedInput  the run can be paused at any time during a wave, and instruments can be placed,
 *                 sold and upgraded while it is paused
 *
 * Hold to press does not apply: Vega has no held input.
 */

import type { AssistProfile } from '@/lib/game/assist';
import type { EnemyType } from './data';

export interface VegaAssistFlags {
  /** Any honoured assist is on (the run is unranked). */
  active: boolean;
  /** The slowest the run clock may run, 0.5 to 1. The fast toggle is always 2. */
  minSpeed: number;
  /** No leak flash, stains or muzzle flashes. */
  calm: boolean;
  /** Which palette the board and the roster icons draw with. */
  palette: 'default' | 'safe';
  /** Pausing mid-wave is allowed and instruments can be placed, sold and upgraded while paused. */
  pauseAnywhere: boolean;
}

export const NO_VEGA_ASSIST: VegaAssistFlags = {
  active: false,
  minSpeed: 1,
  calm: false,
  palette: 'default',
  pauseAnywhere: false,
};

/** The fast speed. It is not an assist: the toggle moves between the floor and this. */
export const FAST_SPEED = 2;

/** The slowest the floor may be (the shared layer's `MIN_SPEED_FLOOR`). */
export const MIN_VEGA_SPEED = 0.5;

/** A ranked profile (or none) is the plain game. */
export function vegaAssistFlags(profile: AssistProfile | null | undefined): VegaAssistFlags {
  if (!profile || profile.ranked) return NO_VEGA_ASSIST;
  const minSpeed = Number.isFinite(profile.speedFloor) ? Math.min(1, Math.max(MIN_VEGA_SPEED, profile.speedFloor)) : 1;
  const calm = profile.calmVisuals;
  const colorSafe = profile.colorSafe;
  const pauseAnywhere = profile.noTimedInput;
  if (minSpeed === 1 && !calm && !colorSafe && !pauseAnywhere) return NO_VEGA_ASSIST;
  return { active: true, minSpeed, calm, palette: colorSafe ? 'safe' : 'default', pauseAnywhere };
}

/** One outline glyph per specimen type, drawn inside the membrane by `art.ts` in colour-safe play. */
export type SpecimenGlyph =
  | 'ring'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'plus'
  | 'cross'
  | 'bars'
  | 'chevron'
  | 'hexagon'
  | 'dots'
  | 'star'
  | 'wave';

export const SPECIMEN_GLYPH: Readonly<Record<EnemyType, SpecimenGlyph>> = {
  ANXIETY: 'star',
  GUILT: 'dots',
  FRAGMENT: 'triangle',
  DEPRESSION: 'bars',
  MANIC: 'chevron',
  DOUBT: 'ring',
  OBSESSION: 'square',
  PARANOIA: 'diamond',
  DREAD: 'cross',
  PATIENT: 'plus',
  SURGEON: 'hexagon',
  SPECIMEN: 'wave',
};
