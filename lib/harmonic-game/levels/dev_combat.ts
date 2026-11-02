/**
 * dev_combat — the combat test range (plan H1.1). One hall, the player at the west end facing
 * east, four `harmonic_target`s at known distances, one of them behind a cover wall.
 *
 *   y ↑
 *  384 ┌────────────────────────────────────────────┐
 *      │                      │            far (900,288)
 *  192 │ P→   near(256,240)     │ behind(640)         │   cover wall: x 480..496, y 120..264
 *   96 │            mid(512,96)                      │
 *    0 └────────────────────────────────────────────┘ x → 1024
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import { box, room, v3, type EntitySource, type LevelSource } from '../compiler';

const CONCRETE = 'harmonic/concrete';
const WHITE_OLD = 'harmonic/paint_white_1971';
const STEEL = 'harmonic/steel_plate';

function target(name: string, x: number, y: number, extra: Record<string, string> = {}): EntitySource {
  return {
    classname: 'harmonic_target',
    origin: v3(x, y, 0),
    keys: { targetname: name, health: '40', ...extra },
    outputs: [`OnHurt range_relay,Trigger,,0,-1`, `OnDeath range_relay,Trigger,,0,-1`],
  };
}

export function devCombatSource(): LevelSource {
  return {
    id: 'dev_combat',
    title: 'Dev combat range',
    world: [
      ...room({ min: v3(0, 0, 0), max: v3(1024, 384, 192), material: WHITE_OLD, floorMaterial: CONCRETE }),
      box(v3(480, 120, 0), v3(496, 264, 192), STEEL),
    ],
    entities: [
      { classname: 'info_player_start', origin: v3(64, 192, 1), angles: v3(0, 0, 0) },
      target('t_near', 256, 240),
      target('t_mid', 512, 96, { health: '100' }),
      target('t_behind', 640, 192),
      target('t_far', 900, 288),
      { classname: 'logic_relay', keys: { targetname: 'range_relay' } },
    ],
  };
}
