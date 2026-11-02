/**
 * dev_weapons — the weapons test range (plan H1.3). The player starts empty-handed at the west end
 * facing east; every weapon and ammo type lies on the floor in a row, then a firing line with two
 * targets, a breakable panel that fills the hall (the prybar pries it open) and a far target behind it.
 *
 *   y ↑
 *  384 ┌──────────────────────────────────────────────┐
 *      │      ammo_pulse ammo_coil      t_b(480,290)  │panel│
 *  192 │ P→  prybar   pulse   coil                    │x=560│  t_far (800,192)
 *      │                                t_a(480,100)  │     │
 *    0 └──────────────────────────────────────────────┘ x → 1024
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import { box, room, v3, type EntitySource, type LevelSource } from '../compiler';

const CONCRETE = 'harmonic/concrete';
const WHITE_OLD = 'harmonic/paint_white_1971';
const STEEL = 'harmonic/steel_plate';

function target(name: string, x: number, y: number): EntitySource {
  return {
    classname: 'harmonic_target',
    origin: v3(x, y, 0),
    keys: { targetname: name, health: '60' },
  };
}

function pickup(classname: string, x: number, y: number): EntitySource {
  return { classname, origin: v3(x, y, 0) };
}

export function devWeaponsSource(): LevelSource {
  return {
    id: 'dev_weapons',
    title: 'Dev weapons range',
    world: [
      ...room({
        min: v3(0, 0, 0),
        max: v3(1024, 384, 192),
        material: WHITE_OLD,
        floorMaterial: CONCRETE,
      }),
    ],
    entities: [
      { classname: 'info_player_start', origin: v3(48, 192, 1), angles: v3(0, 0, 0) },
      pickup('harmonic_weapon_prybar', 140, 192),
      pickup('harmonic_weapon_pulse', 220, 192),
      pickup('harmonic_weapon_coil', 300, 192),
      pickup('harmonic_ammo_pulse', 220, 100),
      pickup('harmonic_ammo_coil', 300, 100),
      target('t_a', 480, 100),
      target('t_b', 480, 290),
      target('t_far', 800, 192),
      {
        classname: 'func_breakable',
        keys: { targetname: 'pry_panel', health: '60', material: '1' },
        brushes: [box(v3(560, 0, 0), v3(568, 384, 192), STEEL)],
      },
    ],
  };
}
