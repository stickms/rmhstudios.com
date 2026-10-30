/**
 * CS:GO's damage and accuracy rules as pure functions, clean-room from public behaviour:
 *
 *   - hit groups (the CS:GO wiki's damage pages: head ×4, stomach ×1.25, chest and arms ×1, legs ×0.75);
 *   - armor (the community's published formula over the weapon's `armor ratio`: an armored hit to a
 *     covered group lets armorRatio / 2 of the damage through and costs half of the rest in armor; the
 *     head is covered only with a helmet, the legs never);
 *   - range falloff (damage × `range modifier` ^ (distance / 500), the CS:GO wiki);
 *   - inaccuracy and spread (items_game's `inaccuracy *` / `spread` attributes, in thousandths of a
 *     radian; moving inaccuracy ramps in from the crouch-walk speed — the community's measurements);
 *   - recoil: the aim punch (weapon_recoil_scale 2, weapon_recoil_decay2_exp 8, weapon_recoil_decay2_lin 18,
 *     weapon_recoil_vel_decay 4.5, view_recoil_tracking 0.45 — public cvars) driven by a spray pattern
 *     generated deterministically from the weapon's `recoil angle`, `recoil magnitude`, their variances
 *     and its `recoil seed` (a clean-room generator: the pattern is this file's own, its shape — a
 *     climb that wanders inside the angle variance — follows the published behaviour);
 *   - penetration (a clean-room model: power from the weapon's `penetration`, per-material modifiers,
 *     damage lost per unit of thickness).
 *
 * Shared by the host and a predicting client (no allocation in the per-shot paths, seeded randomness).
 */

import { UniformRandomStream } from '../tf2-game/core/random';
import {
  HITGROUP_CHEST,
  HITGROUP_GENERIC,
  HITGROUP_HEAD,
  HITGROUP_LEFTARM,
  HITGROUP_LEFTLEG,
  HITGROUP_RIGHTARM,
  HITGROUP_RIGHTLEG,
  HITGROUP_STOMACH,
} from '../tf2-game/core/types';
import type { CsInaccuracy, CsWeaponInfo } from './data/weapon-data';

// ─── Hit groups and armor ───────────────────────────────────────────────────────────────────

/** Damage multiplier per hit group (CS:GO wiki). */
export function hitGroupMultiplier(group: number): number {
  switch (group) {
    case HITGROUP_HEAD:
      return 4;
    case HITGROUP_STOMACH:
      return 1.25;
    case HITGROUP_LEFTLEG:
    case HITGROUP_RIGHTLEG:
      return 0.75;
    case HITGROUP_CHEST:
    case HITGROUP_LEFTARM:
    case HITGROUP_RIGHTARM:
    case HITGROUP_GENERIC:
    default:
      return 1;
  }
}

/** Does armor cover this group (head only with a helmet; legs never)? */
export function armorCovers(group: number, helmet: boolean): boolean {
  if (group === HITGROUP_LEFTLEG || group === HITGROUP_RIGHTLEG) return false;
  if (group === HITGROUP_HEAD) return helmet;
  return true;
}

/** The share of armored damage that still reaches health is armorRatio × ARMOR_RATIO_SCALE. */
export const ARMOR_RATIO_SCALE = 0.5;
/** Each point of absorbed damage costs this much armor ("armor bonus" 0.5 in the community formula). */
export const ARMOR_BONUS = 0.5;

export interface ArmorResult {
  /** Damage to health. */
  health: number;
  /** Armor points lost. */
  armor: number;
}

/**
 * Applies armor to `damage` (already scaled by the hit group): with armor on a covered group the
 * health damage is damage × armorRatio × 0.5 and the armor loses half of what it absorbed; when that
 * is more armor than is left, the armor is used up and the remainder reaches health.
 */
export function applyArmor(
  damage: number,
  group: number,
  armor: number,
  helmet: boolean,
  armorRatio: number,
  out: ArmorResult,
): ArmorResult {
  out.health = damage;
  out.armor = 0;
  if (armor <= 0 || !armorCovers(group, helmet)) return out;
  let health = damage * armorRatio * ARMOR_RATIO_SCALE;
  let lost = (damage - health) * ARMOR_BONUS;
  if (lost > armor) {
    lost = armor;
    health = damage - lost / ARMOR_BONUS;
  }
  out.health = Math.max(0, health);
  out.armor = Math.max(0, lost);
  return out;
}

/** Range falloff: damage × rangeModifier ^ (distance / 500) (CS:GO wiki). */
export const RANGE_FALLOFF_UNIT = 500;
export const rangeDamage = (damage: number, rangeModifier: number, distance: number): number =>
  damage * Math.pow(rangeModifier, distance / RANGE_FALLOFF_UNIT);

// ─── Inaccuracy ─────────────────────────────────────────────────────────────────────────────

/** items_game's inaccuracy and spread are in thousandths of a radian. */
export const INACCURACY_UNIT = 0.001;
/** Moving inaccuracy ramps in from 34 % of the weapon's speed (crouch-walk) to full at 95 % (community measurement). */
export const MOVE_INACCURACY_START = 0.34;
export const MOVE_INACCURACY_FULL = 0.95;

export interface AccuracyState {
  onGround: boolean;
  ducked: boolean;
  /** Horizontal speed (units/s). */
  speed: number;
  /** The weapon's max speed (its `max player speed`, alt when scoped). */
  weaponSpeed: number;
  zoomed: boolean;
  /** The accumulated fire / landing penalty (thousandths of a radian). */
  penalty: number;
}

export function inaccuracyTable(info: CsWeaponInfo, zoomed: boolean): CsInaccuracy {
  return zoomed && info.zoomLevels > 0 ? info.inaccuracyAlt : info.inaccuracy;
}

/** The weapon's inaccuracy now (thousandths of a radian), before the spread. */
export function csInaccuracy(info: CsWeaponInfo, s: AccuracyState): number {
  const t = inaccuracyTable(info, s.zoomed);
  let v = s.ducked ? t.crouch : t.stand;
  if (!s.onGround) {
    v += t.jump;
  } else if (s.weaponSpeed > 0) {
    const lo = s.weaponSpeed * MOVE_INACCURACY_START;
    const hi = s.weaponSpeed * MOVE_INACCURACY_FULL;
    const f = s.speed <= lo ? 0 : s.speed >= hi ? 1 : (s.speed - lo) / (hi - lo);
    v += t.move * f;
  }
  return v + s.penalty;
}

/**
 * The fire / landing penalty recovers to 10 % over the weapon's recovery time (`recovery time
 * stand` / `… crouch`): an exponential decay (the community's reading of the attribute).
 */
export function recoverPenalty(
  penalty: number,
  info: CsWeaponInfo,
  ducked: boolean,
  dt: number,
): number {
  const t = Math.max(0.01, ducked ? info.recoveryCrouch : info.recoveryStand);
  const out = penalty * Math.exp((-dt * Math.LN10) / t);
  return out < 1e-4 ? 0 : out;
}

const TWO_PI = Math.PI * 2;

/**
 * The shot's direction offset in radians (right, up), from the command's seeded stream: an
 * inaccuracy draw (radius × angle) and, per pellet, a spread draw, added (the published description
 * of CS:GO's model: two independent random discs). Writes `out[2 * pellet]`, `out[2 * pellet + 1]`.
 */
export function csShotOffsets(
  stream: UniformRandomStream,
  inaccuracy: number,
  spread: number,
  pellets: number,
  out: Float64Array,
): void {
  const r1 = stream.randomFloat(0, 1);
  const a1 = stream.randomFloat(0, TWO_PI);
  const ix = Math.cos(a1) * r1 * inaccuracy;
  const iy = Math.sin(a1) * r1 * inaccuracy;
  for (let p = 0; p < pellets; p++) {
    const r2 = stream.randomFloat(0, 1);
    const a2 = stream.randomFloat(0, TWO_PI);
    out[2 * p] = (ix + Math.cos(a2) * r2 * spread) * INACCURACY_UNIT;
    out[2 * p + 1] = (iy + Math.sin(a2) * r2 * spread) * INACCURACY_UNIT;
  }
}

// ─── Recoil ─────────────────────────────────────────────────────────────────────────────────

/** weapon_recoil_scale 2: the aim punch moves the shot by twice what the view shows. */
export const WEAPON_RECOIL_SCALE = 2;
/** weapon_recoil_decay2_exp 8, weapon_recoil_decay2_lin 18 (per second). */
export const WEAPON_RECOIL_DECAY_EXP = 8;
export const WEAPON_RECOIL_DECAY_LIN = 18;
/** weapon_recoil_vel_decay 4.5. */
export const WEAPON_RECOIL_VEL_DECAY = 4.5;
/** view_recoil_tracking 0.45: the share of the aim punch the camera shows. */
export const VIEW_RECOIL_TRACKING = 0.45;
/**
 * `recoil magnitude` → aim punch velocity (degrees per second per unit). With the decay cvars above,
 * 1 makes the AK-47 (magnitude 30) kick ~0.5° on its first shot and climb ~10° of effective aim over
 * a ten-shot spray, as the community measures it.
 */
export const RECOIL_MAGNITUDE_UNIT = 1;

/** Shots in a generated spray pattern (it repeats past the end). */
export const RECOIL_TABLE_SIZE = 64;

export interface RecoilParams {
  angle: number;
  angleVariance: number;
  magnitude: number;
  magnitudeVariance: number;
}

/**
 * A weapon's spray pattern: per shot an angle (degrees from straight up, positive to the right) and a
 * magnitude, from its recoil parameters and seed. A seeded random walk inside the angle variance —
 * the first shots climb nearly straight, later ones wander side to side — with each magnitude drawn
 * within its variance. Server and predicting client build the same table from the same data.
 */
export function buildRecoilTable(seed: number, p: RecoilParams): Float32Array {
  const out = new Float32Array(RECOIL_TABLE_SIZE * 2);
  const rng = new UniformRandomStream(seed | 0);
  let a = p.angle;
  for (let i = 0; i < RECOIL_TABLE_SIZE; i++) {
    // The early shots stay near the base angle; the walk opens up over the first five.
    const freedom = Math.min(1, i / 5);
    a += rng.randomFloat(-p.angleVariance, p.angleVariance) * 0.35 * freedom;
    const lo = p.angle - p.angleVariance;
    const hi = p.angle + p.angleVariance;
    if (a < lo) a = lo + (lo - a) * 0.5;
    if (a > hi) a = hi - (a - hi) * 0.5;
    const m = p.magnitude + rng.randomFloat(-p.magnitudeVariance, p.magnitudeVariance);
    out[i * 2] = a;
    out[i * 2 + 1] = Math.max(0, m);
  }
  return out;
}

const recoilTables = new Map<string, Float32Array>();

/** The weapon's pattern (cached per weapon and mode). */
export function recoilTableFor(info: CsWeaponInfo, zoomed: boolean): Float32Array {
  const key = `${info.name}:${zoomed && info.zoomLevels > 0 ? 1 : 0}`;
  let t = recoilTables.get(key);
  if (!t) {
    t = buildRecoilTable(
      info.recoil.seed,
      zoomed && info.zoomLevels > 0 ? info.recoilAlt : info.recoil,
    );
    recoilTables.set(key, t);
  }
  return t;
}

/** The aim punch a player carries (degrees: x pitch, y yaw) and its velocity. */
export interface AimPunch {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** One shot's kick: the pattern's entry for `recoilIndex` added to the punch velocity. */
export function kickAimPunch(punch: AimPunch, table: Float32Array, recoilIndex: number): void {
  const i = (Math.max(0, Math.floor(recoilIndex)) % RECOIL_TABLE_SIZE) * 2;
  const a = (table[i] * Math.PI) / 180;
  const m = table[i + 1] * RECOIL_MAGNITUDE_UNIT;
  // Up is −pitch; a positive angle drifts right, which is −yaw in Source's angles.
  punch.vx -= Math.cos(a) * m;
  punch.vy -= Math.sin(a) * m;
}

/** Advances the aim punch by `dt`: velocity integrates and decays, the punch decays toward zero. */
export function decayAimPunch(punch: AimPunch, dt: number): void {
  punch.x += punch.vx * dt;
  punch.y += punch.vy * dt;
  const vd = Math.exp(-WEAPON_RECOIL_VEL_DECAY * dt);
  punch.vx *= vd;
  punch.vy *= vd;
  const len = Math.hypot(punch.x, punch.y);
  if (len > 0) {
    const next = Math.max(
      0,
      len * Math.exp(-WEAPON_RECOIL_DECAY_EXP * dt) - WEAPON_RECOIL_DECAY_LIN * dt,
    );
    const s = next / len;
    punch.x *= s;
    punch.y *= s;
  }
  if (Math.abs(punch.vx) < 1e-4 && Math.abs(punch.vy) < 1e-4) punch.vx = punch.vy = 0;
}

// ─── Penetration ────────────────────────────────────────────────────────────────────────────

/**
 * Per-material penetration modifiers, by keywords in the surface's material name (the map manifest
 * carries no `$surfaceprop`, so CS:GO's surfaceproperties values cannot be read; these defaults
 * follow the published behaviour: thin wood, plaster and glass are easy to shoot through, metal less
 * so, stone and concrete hardly at all).
 */
const MATERIAL_PENETRATION: ReadonlyArray<readonly [RegExp, number]> = [
  [/glass|window/i, 2.0],
  [/cardboard|paper|cloth|fabric|carpet/i, 1.6],
  [/plaster|drywall|stucco/i, 1.2],
  [/wood|plywood|crate|door/i, 1.0],
  [/grate|chainlink|fence|vent/i, 1.4],
  [/metal|steel|tin|iron/i, 0.6],
  [/dirt|sand|mud|ground|gravel/i, 0.6],
  [/concrete|brick|stone|rock|tile|marble|cobble/i, 0.45],
];
/** Anything unnamed or unknown. */
export const DEFAULT_PENETRATION_MODIFIER = 0.75;

export function materialPenetration(material: string): number {
  for (const [re, v] of MATERIAL_PENETRATION) if (re.test(material)) return v;
  return DEFAULT_PENETRATION_MODIFIER;
}

/** Units of a modifier-1 material one point of penetration power goes through. */
export const PENETRATION_DEPTH_PER_POWER = 24;
/** Damage kept after any penetration, before the thickness loss. */
export const PENETRATION_DAMAGE_KEEP = 0.75;
/** Surfaces a bullet may pass: 2 per point of penetration power (rifles 4, pistols 2, the AWP 5). */
export const maxPenetrations = (power: number): number => Math.max(0, Math.floor(power * 2));

/** How deep (units) a bullet of `power` goes through `material`. */
export const penetrationDepth = (power: number, material: string): number =>
  PENETRATION_DEPTH_PER_POWER * power * materialPenetration(material);

/** Damage after passing `thickness` units of material that allows `depth` (0 when it cannot). */
export function damageAfterPenetration(damage: number, thickness: number, depth: number): number {
  if (depth <= 0 || thickness > depth) return 0;
  return damage * PENETRATION_DAMAGE_KEEP * (1 - thickness / depth);
}
