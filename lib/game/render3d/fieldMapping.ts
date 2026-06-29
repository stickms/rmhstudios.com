export type FieldOpts = { speedMod: number; oneTrack: boolean };

/** Seconds of track visible from spawn edge to the hit line (matches 2D ~3s window). */
export const WORLD_LOOKAHEAD_S = 3;

/** World units between the two lane centers (lane 0 above, lane 1 below). */
export const LANE_SPREAD = 1.6;

/** World units the spawn edge sits from the hit line. Camera framing fits this. */
const FIELD_DEPTH = 12;

/**
 * Scroll position along world X for a note.
 * @param timeDelta slice.time − audioTime (seconds; 0 = now/at hit line, >0 = future)
 * @param speedMod the `modifiers.speed` value (higher = faster scroll = closer)
 *
 * Parity with the 2D renderer: position is linear in timeDelta and inversely
 * scaled by speedMod, with a full lookahead window (WORLD_LOOKAHEAD_S / speedMod
 * seconds) spanning FIELD_DEPTH world units.
 */
export function scrollWorldX(timeDelta: number, speedMod: number): number {
  // Parity: position is inversely proportional to speedMod — higher speed means
  // the same time-delta note maps closer to the hit line (x=0), matching the 2D
  // renderer's effective PPS = FIELD_DEPTH / (WORLD_LOOKAHEAD_S * speedMod).
  return (timeDelta / (WORLD_LOOKAHEAD_S * speedMod)) * FIELD_DEPTH;
}

/** Lane center on world Y. Lane 0 above (+), lane 1 below (−); oneTrack → 0. */
export function laneWorldY(lane: number, opts: FieldOpts): number {
  if (opts.oneTrack) return 0;
  return lane === 1 ? -LANE_SPREAD / 2 : LANE_SPREAD / 2;
}
