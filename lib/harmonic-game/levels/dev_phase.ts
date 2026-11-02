/**
 * dev_phase — the phase-layer test level (plan H2.1). One hall, 512 x 384, split by two things
 * that exist in only one layer of the ship:
 *
 *   - a PAST-only wall across the hall at x 248..264 (blocks in 1971, a ghost in 2030);
 *   - a PRESENT-only bridge over a 128-deep pit at x 320..448 (walkable in 2030, gone in 1971).
 *
 * A wall button beside the start toggles the player's layer (`harmonic_phase` / `Toggle`). The
 * player starts in the present, so the wall is open and the bridge is solid.
 *
 *   y ↑          N
 *  384 ┌──────────────┬───────────────┐
 *      │ button   wall│  pit + bridge │   x → 512
 *    0 └──────────────┴───────────────┘
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import { box, room, v3, type BrushSource, type EntitySource, type LevelSource } from '../compiler';

const CONCRETE = 'harmonic/concrete';
const STEEL = 'harmonic/steel_plate';
const OLD = 'harmonic/paint_white_1971';
const NEW = 'harmonic/paint_white_2030';
const GRATING = 'harmonic/grating';
const HAZARD = 'harmonic/hazard_stripe';

export const DEV_PHASE = {
  /** The past-only wall's x range. */
  wallX: [248, 264] as const,
  /** The present-only bridge's x range and the pit floor. */
  bridgeX: [320, 448] as const,
  pitFloor: -128,
};

function world(): BrushSource[] {
  const out: BrushSource[] = [];
  out.push(
    ...room({
      min: v3(0, 0, DEV_PHASE.pitFloor),
      max: v3(512, 384, 160),
      material: NEW,
      floorMaterial: STEEL,
      ceilingMaterial: NEW,
    }),
  );
  // The walking floor at z=0 either side of the pit.
  out.push(
    box(v3(0, 0, DEV_PHASE.pitFloor), v3(DEV_PHASE.bridgeX[0], 384, 0), CONCRETE),
    box(v3(DEV_PHASE.bridgeX[1], 0, DEV_PHASE.pitFloor), v3(512, 384, 0), CONCRETE),
  );
  // Past wall, floor to ceiling, and the present bridge (its top at z=0 is the walking floor).
  out.push(
    box(v3(DEV_PHASE.wallX[0], 0, 0), v3(DEV_PHASE.wallX[1], 384, 160), OLD, { layer: 'past' }),
    box(v3(DEV_PHASE.bridgeX[0], 0, -16), v3(DEV_PHASE.bridgeX[1], 384, 0), GRATING, {
      layer: 'present',
    }),
  );
  return out;
}

function entities(): EntitySource[] {
  return [
    { classname: 'info_player_start', origin: v3(96, 192, 1), angles: v3(0, 0, 0) },
    {
      // A wall button on the west wall: toggles the player's layer.
      classname: 'func_button',
      keys: {
        targetname: 'phase_button',
        movedir: '0 180 0',
        speed: '40',
        wait: '1',
        spawnflags: '1024',
      },
      brushes: [box(v3(0, 176, 40), v3(6, 192, 56), HAZARD)],
      outputs: ['OnPressed harmonic_phase,Toggle,,0,-1'],
    },
  ];
}

export function devPhaseSource(): LevelSource {
  return { id: 'dev_phase', title: 'Dev phase', startLayer: 'present', world: world(), entities: entities() };
}
