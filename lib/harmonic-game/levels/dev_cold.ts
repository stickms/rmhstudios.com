/**
 * dev_cold — the cold and shelter test level (plan H1.2). An outdoor snow field (the level default
 * is `outdoor`, so the cold meter drains everywhere outside a shelter), a wind gap between two
 * rock walls (a `wind` volume: drains faster), and a hut with an open door holding a heater (a
 * `shelter` volume plus warmth).
 *
 *   y ↑            N
 * 1024 ┌──────────────────────────────────────────┐
 *      │         ▓ rock                 ┌──hut──┐ │
 *  512 │ P→   [wind gap x 440..640]     door  H   │ │   H = heater (1130, 512)
 *      │         ▓ rock                 └───────┘ │
 *    0 └──────────────────────────────────────────┘ x → 1536
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import type { Vec3 } from '../../tf2-game/core/vec';
import { box, room, v3, type BrushSource, type EntitySource, type LevelSource } from '../compiler';

const SNOW = 'harmonic/snow';
const ICE = 'harmonic/ice';
const ROCK = 'harmonic/concrete';
const WOOD = 'harmonic/wood_deck';
const NODRAW = 'harmonic/nodraw';

export const DEV_COLD = {
  start: v3(96, 512, 1),
  /** The hut interior (also the shelter volume). */
  hut: { min: v3(1000, 320, 0), max: v3(1256, 704, 128) },
  heater: v3(1130, 512, 0),
  /** The wind volume's box (over the gap between the rock walls). */
  wind: { min: v3(440, 392, 0), max: v3(640, 632, 192) },
};

function world(): BrushSource[] {
  const { hut } = DEV_COLD;
  return [
    ...room({
      min: v3(0, 0, 0),
      max: v3(1536, 1024, 384),
      material: SNOW,
      floorMaterial: SNOW,
      ceilingMaterial: 'harmonic/sky',
    }),
    // A patch of ice by the start, for the footsteps.
    box(v3(32, 400, 0), v3(160, 624, 1), ICE),
    // The wind gap: two rock walls with a 240-wide opening between them.
    box(v3(520, 0, 0), v3(552, 392, 192), ROCK),
    box(v3(520, 632, 0), v3(552, 1024, 192), ROCK),
    // The hut: walls, a roof, a door facing west.
    ...room({
      min: hut.min,
      max: hut.max,
      wall: 16,
      material: WOOD,
      floorMaterial: WOOD,
      ceilingMaterial: WOOD,
      doors: [{ wall: 'west', at: 512, width: 96, height: 96 }],
    }),
  ];
}

function volume(
  name: string,
  mode: string,
  min: Vec3,
  max: Vec3,
  extra: Record<string, string> = {},
): EntitySource {
  return {
    classname: 'trigger_harmonic_exposure',
    keys: { targetname: name, mode, ...extra },
    brushes: [box(min, max, NODRAW)],
  };
}

function entities(): EntitySource[] {
  const { hut, wind, heater } = DEV_COLD;
  return [
    { classname: 'info_player_start', origin: DEV_COLD.start, angles: v3(0, 0, 0) },
    volume('cold_hut', 'shelter', hut.min, hut.max, {
      area: 'camp_interior',
      hint: 'Warm. Stay a while.',
      hintkey: 'harmonic:hint_dev_cold_hut',
    }),
    volume('cold_wind', 'wind', wind.min, wind.max),
    {
      classname: 'harmonic_heater',
      origin: heater,
      angles: v3(0, 0, 0),
      keys: { targetname: 'hut_heater', radius: '160' },
    },
  ];
}

export function devColdSource(): LevelSource {
  return {
    id: 'dev_cold',
    title: 'Dev cold',
    exposure: 'outdoor',
    exposureArea: 'ice_open',
    fog: { color: [210, 220, 230], start: 300, end: 1800, maxDensity: 0.85 },
    world: world(),
    entities: entities(),
  };
}
