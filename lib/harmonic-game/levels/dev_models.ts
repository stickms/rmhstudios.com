/**
 * dev_models — the model showcase level (plan H2.4): one hall with a Meridian trooper playing
 * `idle`, a shield bearer, a drifter, Ines and Lind, and the props, so the entity renderer drawing
 * every procedural model is checked in the real game (`/harmonic?level=dev_models`).
 *
 *   y ↑      N
 *  384 ┌────────────────────────────────────┐
 *      │  crate  locker heater  mast  lamp  │   props along the north wall
 *  256 │   trooper  shield  drifter  ines   │   the cast, facing the start
 *   64 │ start →                            │
 *      └────────────────────────────────────┘ x → 768
 *
 * Source units, Z up. Pure data: no DOM.
 */
import { box, room, v3, type BrushSource, type EntitySource, type LevelSource } from '../compiler';
import { modelPath } from '../assets/models/info';

const CONCRETE = 'harmonic/concrete';
const STEEL = 'harmonic/steel_plate';
const WHITE_OLD = 'harmonic/paint_white_1971';

function hall(): BrushSource[] {
  return [
    ...room({
      min: v3(0, 0, 0),
      max: v3(768, 384, 192),
      material: WHITE_OLD,
      floorMaterial: CONCRETE,
      ceilingMaterial: WHITE_OLD,
    }),
    // A low plinth under the cast: they read against it.
    box(v3(160, 224, 0), v3(704, 296, 2), STEEL),
  ];
}

const model = (
  name: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  keys: Record<string, string> = {},
): EntitySource => ({
  classname: 'prop_dynamic',
  origin: v3(x, y, z),
  angles: v3(0, yaw, 0),
  keys: { model: modelPath(name), DefaultAnim: 'idle', ...keys },
});

function entities(): EntitySource[] {
  return [
    { classname: 'info_player_start', origin: v3(64, 160, 1), angles: v3(0, 0, 0) },
    // The cast faces west, toward the start. Characters stand on the plinth (z = 2).
    model('meridian_trooper', 240, 260, 2, 180),
    model('meridian_shield', 330, 260, 2, 180),
    model('unstrung_drifter', 420, 260, 2, 180, { renderamt: '170', rendermode: '1' }),
    model('ines', 510, 260, 2, 180),
    model('lind_old', 600, 260, 2, 180),
    // Props along the north wall (origin at the base centre).
    model('crate', 180, 340, 0, 200, { DefaultAnim: '' }),
    model('locker', 280, 356, 0, 270, { DefaultAnim: '' }),
    model('heater', 370, 356, 0, 270, { DefaultAnim: '' }),
    model('antenna_mast', 480, 340, 0, 0, { DefaultAnim: '' }),
    model('lamp_post', 560, 340, 0, 270, { DefaultAnim: '' }),
    model('oil_drum', 650, 340, 0, 0, { DefaultAnim: '' }),
  ];
}

export function devModelsSource(): LevelSource {
  return {
    id: 'dev_models',
    title: 'Dev models',
    world: hall(),
    entities: entities(),
  };
}
