import { z } from 'zod';

/**
 * The armoury: six guns whose numbers are inspired by the CS:GO default weapons (cycle time, magazine, damage and
 * range falloff, see lib/csgo-game/data) and the Half-Life 2 set (pistol, SMG1, shotgun, AR2, .357), re-scaled for
 * a 4 m tile and a 20 Hz tick, and renamed so nothing here is anyone's trademark. Times are in ticks (50 ms),
 * distances in tiles, money in in-game units.
 */
export const WEAPON_IDS = ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'marksman'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export const weaponSchema = z.object({
  name: z.string().min(1),
  /** What it is modelled on, for the armoury's flavour line. */
  inspiredBy: z.string().min(1),
  /** Damage per pellet at point-blank. */
  damage: z.number().int().positive(),
  pellets: z.number().int().min(1).max(12),
  /** Ticks between shots. */
  fireTicks: z.number().int().positive(),
  magazine: z.number().int().positive(),
  reloadTicks: z.number().int().positive(),
  /** Furthest a pellet travels, in tiles. */
  range: z.number().positive(),
  /** Random sideways error: a pellet's direction is off by up to this much (tan of the angle). */
  spread: z.number().nonnegative(),
  /** Damage lost at full range (0.4 → 40 % less at the very end of its reach). */
  falloff: z.number().min(0).max(1),
  price: z.number().int().positive(),
  /** One spare magazine. */
  ammoPrice: z.number().int().positive(),
  /** Spare magazines you start with, and the most you can carry. */
  startMags: z.number().int().nonnegative(),
  maxMags: z.number().int().positive(),
});
export type WeaponDef = z.infer<typeof weaponSchema>;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    name: 'Service pistol',
    inspiredBy: 'USP / HL2 pistol',
    damage: 14,
    pellets: 1,
    fireTicks: 6,
    magazine: 12,
    reloadTicks: 36,
    range: 10,
    spread: 0.03,
    falloff: 0.4,
    price: 120,
    ammoPrice: 24,
    startMags: 2,
    maxMags: 6,
  },
  revolver: {
    name: 'Magnum revolver',
    inspiredBy: 'Desert Eagle / .357',
    damage: 34,
    pellets: 1,
    fireTicks: 14,
    magazine: 6,
    reloadTicks: 56,
    range: 12,
    spread: 0.02,
    falloff: 0.3,
    price: 450,
    ammoPrice: 40,
    startMags: 2,
    maxMags: 5,
  },
  smg: {
    name: 'Machine pistol',
    inspiredBy: 'MP9 / SMG1',
    damage: 8,
    pellets: 1,
    fireTicks: 2,
    magazine: 30,
    reloadTicks: 44,
    range: 8,
    spread: 0.07,
    falloff: 0.5,
    price: 380,
    ammoPrice: 45,
    startMags: 2,
    maxMags: 6,
  },
  shotgun: {
    name: 'Pump scattergun',
    inspiredBy: 'Nova / SPAS-12',
    damage: 10,
    pellets: 8,
    fireTicks: 18,
    magazine: 6,
    reloadTicks: 60,
    range: 5.5,
    spread: 0.14,
    falloff: 0.55,
    price: 500,
    ammoPrice: 35,
    startMags: 2,
    maxMags: 5,
  },
  rifle: {
    name: 'Assault carbine',
    inspiredBy: 'AK-47 / AR2',
    damage: 11,
    pellets: 1,
    fireTicks: 3,
    magazine: 30,
    reloadTicks: 52,
    range: 14,
    spread: 0.05,
    falloff: 0.35,
    price: 1100,
    ammoPrice: 90,
    startMags: 2,
    maxMags: 5,
  },
  marksman: {
    name: 'Long rifle',
    inspiredBy: 'Scout / AWP',
    damage: 70,
    pellets: 1,
    fireTicks: 36,
    magazine: 5,
    reloadTicks: 70,
    range: 22,
    spread: 0.012,
    falloff: 0.15,
    price: 1800,
    ammoPrice: 150,
    startMags: 2,
    maxMags: 4,
  },
};

export const isWeaponId = (v: unknown): v is WeaponId =>
  typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v);

/** The police. The skin is the Source-flavoured look the renderer dresses them in (lib/hearthworks/skins/looks.ts). */
export const OFFICER_KINDS = ['metrocop', 'combine-soldier'] as const;
export type OfficerKind = (typeof OFFICER_KINDS)[number];

export interface OfficerDef {
  name: string;
  hp: number;
  weapon: WeaponId;
  /** Scales the weapon's damage (officers are a little less lethal than the same gun in a player's hands). */
  damageMul: number;
  /** Scales the ticks between shots: officers fire in measured bursts, not at the gun's full rate. */
  fireMul: number;
  /** Scales the weapon's spread: higher is worse aim. */
  spreadMul: number;
  /** Cash that falls out of their pockets when they go down. */
  drop: number;
}

export const OFFICERS: Record<OfficerKind, OfficerDef> = {
  metrocop: {
    name: 'Metrocop',
    hp: 60,
    weapon: 'pistol',
    damageMul: 0.85,
    fireMul: 2,
    spreadMul: 1.6,
    drop: 40,
  },
  'combine-soldier': {
    name: 'Combine soldier',
    hp: 130,
    weapon: 'rifle',
    damageMul: 0.9,
    fireMul: 3.5,
    spreadMul: 1.1,
    drop: 90,
  },
};
