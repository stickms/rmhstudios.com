/**
 * Killstreak kits on weapons: the sheen (Specialized and Professional kits, attribute
 * `killstreak_idleeffect` 1–7) and the killstreaker (Professional kits, `killstreak_effect`
 * 2002–2008). A loadout entry records them as `sheen` and `streaker`; the game draws the sheen
 * on the weapon (a tinted, sweeping rim) and, during a streak of five kills or more, the
 * killstreaker's particles at the wearer's eyes in the sheen's colour (the game's class_fx.pcf
 * `killstreak_t<n>_lvl<1|2>`, its control point 9 the colour). Pure data.
 */

export interface Sheen {
  id: number;
  name: string;
  /** sRGB 0–255 (C_TFPlayer's killstreak colours); Team Shine is the wearer's team colour. */
  red: readonly [number, number, number];
  blu: readonly [number, number, number];
}

export const SHEENS: readonly Sheen[] = [
  { id: 1, name: 'Team Shine', red: [200, 20, 15], blu: [40, 98, 200] },
  { id: 2, name: 'Deadly Daffodil', red: [242, 172, 10], blu: [242, 172, 10] },
  { id: 3, name: 'Manndarin', red: [255, 75, 5], blu: [255, 75, 5] },
  { id: 4, name: 'Mean Green', red: [100, 255, 10], blu: [100, 255, 10] },
  { id: 5, name: 'Agonizing Emerald', red: [40, 255, 70], blu: [40, 255, 70] },
  { id: 6, name: 'Villainous Violet', red: [105, 20, 255], blu: [105, 20, 255] },
  { id: 7, name: 'Hot Rod', red: [255, 30, 255], blu: [255, 30, 255] },
];

export interface Killstreaker {
  id: number;
  name: string;
  /** `killstreak_t<n>`: the particle system's tier number. */
  tier: number;
}

export const KILLSTREAKERS: readonly Killstreaker[] = [
  { id: 2002, name: 'Fire Horns', tier: 1 },
  { id: 2003, name: 'Cerebral Discharge', tier: 2 },
  { id: 2004, name: 'Tornado', tier: 3 },
  { id: 2005, name: 'Flames', tier: 4 },
  { id: 2006, name: 'Singularity', tier: 5 },
  { id: 2007, name: 'Incinerator', tier: 6 },
  { id: 2008, name: 'Hypno-Beam', tier: 7 },
];

/** Kills in a streak at which the killstreaker shows (level 1), and grows (level 2). */
export const STREAK_LEVELS = [5, 10] as const;

export const sheenById = (id: number | undefined): Sheen | undefined =>
  id === undefined ? undefined : SHEENS.find((s) => s.id === id);

export const killstreakerById = (id: number | undefined): Killstreaker | undefined =>
  id === undefined ? undefined : KILLSTREAKERS.find((k) => k.id === id);

/** A sheen's colour for a team (3 = BLU), sRGB 0–1; undefined for no or an unknown sheen. */
export function sheenColor(
  id: number | undefined,
  team: number,
): [number, number, number] | undefined {
  const s = sheenById(id);
  if (!s) return undefined;
  const c = team === 3 ? s.blu : s.red;
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

/**
 * The killstreaker's particle system for a streak of `kills` (undefined below level 1, or with no
 * killstreaker).
 */
export function killstreakerSystem(id: number | undefined, kills: number): string | undefined {
  const k = killstreakerById(id);
  if (!k || kills < STREAK_LEVELS[0]) return undefined;
  return `killstreak_t${k.tier}_lvl${kills >= STREAK_LEVELS[1] ? 2 : 1}`;
}

/** The particle systems a killstreaker can spawn (for the game's particle channel list). */
export const KILLSTREAKER_SYSTEMS: readonly string[] = KILLSTREAKERS.flatMap((k) => [
  `killstreak_t${k.tier}_lvl1`,
  `killstreak_t${k.tier}_lvl2`,
]);
