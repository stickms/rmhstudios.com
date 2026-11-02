/**
 * Harmonic's weapon table (plan H1.3): every number the weapon system uses. Units: Source inches,
 * seconds, degrees. `weapons.ts` reads only this.
 *
 * Slots are the 1-based number keys (`weaponSelect = slot`). Spread is the half-angle of the cone a
 * shot lands in (hip fire; aimed fire scales it by `adsSpreadScale`).
 */
import { MELEE_DAMAGE, MELEE_RANGE } from './constants';

export type WeaponId = 'prybar' | 'pulse' | 'coil';
export type AmmoType = 'pulse' | 'coil';

export const WEAPON_IDS: readonly WeaponId[] = ['prybar', 'pulse', 'coil'];
export const AMMO_TYPES: readonly AmmoType[] = ['pulse', 'coil'];

export interface WeaponDef {
  id: WeaponId;
  /** The pickup entity that grants it. */
  classname: string;
  /** 1-based number-key slot. */
  slot: number;
  kind: 'melee' | 'hitscan';
  damage: number;
  range: number;
  /** Seconds between shots (swings). */
  fireInterval: number;
  /** Full-auto weapons fire while attack is held; the rest need a fresh press. */
  auto: boolean;
  /** Spread half-angle (degrees) when firing from the hip. */
  spread: number;
  /** Multiplier on `spread` while aiming down sights. */
  adsSpreadScale: number;
  /** Rounds per clip (0 = no ammo: melee). */
  clip: number;
  /** Which reserve pool feeds the clip (null: melee). */
  ammo: AmmoType | null;
  reloadTime: number;
  /** Seconds after equipping before it can fire. */
  drawTime: number;
  /** Field of view while aiming (0 = no aim-down-sights). */
  adsFov: number;
  /** Seconds the zoom takes to settle (`zoom` event rate). */
  adsRate: number;
  /** Rounds the pickup entity gives in reserve (a first pickup also fills the clip). */
  pickupReserve: number;
  worldModel: string;
  viewModel: string;
  /** Sound-bus names (`audio/events.ts`). */
  sounds: {
    fire: 'pulse.fire' | 'coil.fire' | 'melee.swing';
    reload: 'pulse.reload' | 'coil.reload' | null;
    empty: 'pulse.empty' | 'coil.empty' | null;
  };
}

/** Damage the prybar does to a `func_breakable` (panels pry open in two swings). */
export const PRYBAR_PANEL_DAMAGE = 35;

/** Ammo pickups: rounds added to reserve. */
export const AMMO_PICKUP_AMOUNT: Record<AmmoType, number> = { pulse: 24, coil: 45 };
/** Reserve ceiling per pool. */
export const RESERVE_MAX: Record<AmmoType, number> = { pulse: 72, coil: 150 };

/** A pickup is collected when the player's origin is within this many units. */
export const PICKUP_RADIUS = 40;
/** Seconds between a pickup's proximity checks. */
export const PICKUP_SCAN_INTERVAL = 0.1;
/** How high above the floor the pickup model floats. */
export const PICKUP_MODEL_LIFT = 12;

/** Seed of the spread stream; the n-th shot's offset is a pure function of (seed, n). */
export const SPREAD_SEED = 0x5ca1ab1e;

const MODELS = 'models/harmonic/';

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  prybar: {
    id: 'prybar',
    classname: 'harmonic_weapon_prybar',
    slot: 1,
    kind: 'melee',
    damage: MELEE_DAMAGE,
    range: MELEE_RANGE,
    fireInterval: 0.55,
    auto: false,
    spread: 0,
    adsSpreadScale: 1,
    clip: 0,
    ammo: null,
    reloadTime: 0,
    drawTime: 0.5,
    adsFov: 0,
    adsRate: 0,
    pickupReserve: 0,
    worldModel: `${MODELS}w_prybar.mdl`,
    viewModel: `${MODELS}v_prybar.mdl`,
    sounds: { fire: 'melee.swing', reload: null, empty: null },
  },
  pulse: {
    id: 'pulse',
    classname: 'harmonic_weapon_pulse',
    slot: 2,
    kind: 'hitscan',
    damage: 12,
    range: 4096,
    fireInterval: 0.28,
    auto: false,
    spread: 0.6,
    adsSpreadScale: 1,
    clip: 12,
    ammo: 'pulse',
    reloadTime: 1.2,
    drawTime: 0.5,
    adsFov: 0,
    adsRate: 0,
    pickupReserve: 24,
    worldModel: `${MODELS}w_pulse_pistol.mdl`,
    viewModel: `${MODELS}v_pulse_pistol.mdl`,
    sounds: { fire: 'pulse.fire', reload: 'pulse.reload', empty: 'pulse.empty' },
  },
  coil: {
    id: 'coil',
    classname: 'harmonic_weapon_coil',
    slot: 3,
    kind: 'hitscan',
    damage: 9,
    range: 4096,
    fireInterval: 0.1,
    auto: true,
    spread: 2.2,
    adsSpreadScale: 0.25,
    clip: 30,
    ammo: 'coil',
    reloadTime: 1.5,
    drawTime: 0.6,
    adsFov: 45,
    adsRate: 0.15,
    pickupReserve: 60,
    worldModel: `${MODELS}w_coil_rifle.mdl`,
    viewModel: `${MODELS}v_coil_rifle.mdl`,
    sounds: { fire: 'coil.fire', reload: 'coil.reload', empty: 'coil.empty' },
  },
};

export function weaponBySlot(slot: number): WeaponDef | undefined {
  return WEAPON_IDS.map((i) => WEAPONS[i]).find((w) => w.slot === slot);
}

export function weaponByClassname(classname: string): WeaponDef | undefined {
  const lc = classname.toLowerCase();
  return WEAPON_IDS.map((i) => WEAPONS[i]).find((w) => w.classname === lc);
}
