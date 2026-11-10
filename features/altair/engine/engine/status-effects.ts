// =============================================================================
// ALTAIR ENGINE -- Status Effects System
// =============================================================================
// Manages poison, slow, stun, freeze, curse, mark, empower, and intangible
// effects on entities.
// =============================================================================

import { StatusEffect, EnemyEntity, PlayerEntity } from './types';

// ---- Apply / Remove ---------------------------------------------------------

/** Apply a status effect to an entity. Refreshes duration if already present. */
export function applyStatusEffect(
  effects: StatusEffect[],
  type: StatusEffect['type'],
  duration: number,
  magnitude: number,
  sourceId?: number,
): void {
  const existing = effects.find((e) => e.type === type);
  if (existing) {
    // Refresh: take max duration, max magnitude
    existing.duration = Math.max(existing.duration, duration);
    existing.magnitude = Math.max(existing.magnitude, magnitude);
    if (sourceId !== undefined) existing.sourceId = sourceId;
  } else {
    effects.push({ type, duration, magnitude, sourceId });
  }
}

/** Remove all effects of a given type. */
export function removeStatusEffect(
  effects: StatusEffect[],
  type: StatusEffect['type'],
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].type === type) {
      effects.splice(i, 1);
    }
  }
}

// ---- Queries ----------------------------------------------------------------

export function hasEffect(
  effects: StatusEffect[],
  type: StatusEffect['type'],
): boolean {
  return effects.some((e) => e.type === type);
}

export function getEffectMagnitude(
  effects: StatusEffect[],
  type: StatusEffect['type'],
): number {
  const e = effects.find((e) => e.type === type);
  return e ? e.magnitude : 0;
}

/** Get the cumulative slow factor (0 = no slow, 1 = fully stopped). */
export function getSlowFactor(effects: StatusEffect[]): number {
  let slow = 0;
  for (const e of effects) {
    if (e.type === 'slow') slow += e.magnitude;
    if (e.type === 'curse') slow += e.magnitude;
  }
  return Math.min(slow, 0.9); // Cap at 90% slow
}

/** Check if entity is stunned or frozen (cannot move or attack). */
export function isImmobilized(effects: StatusEffect[]): boolean {
  return effects.some((e) => e.type === 'stun' || e.type === 'freeze');
}

/** Check if entity is intangible (cannot be hit). */
export function isIntangible(effects: StatusEffect[]): boolean {
  return effects.some((e) => e.type === 'intangible');
}

/** Check if entity is marked (takes extra damage). */
export function isMarked(effects: StatusEffect[]): boolean {
  return effects.some((e) => e.type === 'mark');
}

/** Get mark damage multiplier (1.0 if not marked). */
export function getMarkMultiplier(effects: StatusEffect[], isBoss: boolean): number {
  const mark = effects.find((e) => e.type === 'mark');
  if (!mark) return 1.0;
  // Bosses take reduced mark bonus (+20% instead of +40%)
  return isBoss ? 1.2 : 1.0 + mark.magnitude;
}

/** Check if entity is empowered. Returns speed and damage multipliers. */
export function getEmpowerBonuses(effects: StatusEffect[]): { speedMul: number; damageMul: number } {
  const emp = effects.find((e) => e.type === 'empower');
  if (!emp) return { speedMul: 1.0, damageMul: 1.0 };
  // magnitude encodes speed bonus; damage bonus is 80% of speed bonus
  return { speedMul: 1.0 + emp.magnitude, damageMul: 1.0 + emp.magnitude * 0.8 };
}

// ---- Tick / Update ----------------------------------------------------------

/** Tick all status effects, decrement durations, remove expired. */
export function tickStatusEffects(effects: StatusEffect[], delta: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].duration -= delta;
    if (effects[i].duration <= 0) {
      effects.splice(i, 1);
    }
  }
}

/**
 * Process poison damage on an enemy.
 * Returns total damage dealt this frame.
 */
export function processPoison(
  effects: StatusEffect[],
  delta: number,
): number {
  let totalDmg = 0;
  for (const e of effects) {
    if (e.type === 'poison') {
      // magnitude = damage per second
      totalDmg += e.magnitude * delta;
    }
  }
  return totalDmg;
}

/** Apply damage from enemy status effects and return damage dealt. */
export function processEnemyStatusDamage(
  enemy: EnemyEntity,
  delta: number,
): number {
  const poisonDmg = processPoison(enemy.statusEffects, delta);
  if (poisonDmg > 0) {
    enemy.hp -= poisonDmg;
    if (poisonDmg >= 1) {
      enemy.flashTimer = Math.max(enemy.flashTimer, 0.05);
    }
  }
  return poisonDmg;
}

// ---- Helpers for specific effect types --------------------------------------

/** Apply poison to an entity. */
export function applyPoison(
  effects: StatusEffect[],
  dps: number,
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'poison', duration, dps, sourceId);
}

/** Apply slow to an entity. */
export function applySlow(
  effects: StatusEffect[],
  slowPercent: number,
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'slow', duration, slowPercent, sourceId);
}

/** Apply stun to an entity. */
export function applyStun(
  effects: StatusEffect[],
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'stun', duration, 1, sourceId);
}

/** Apply freeze to an entity. */
export function applyFreeze(
  effects: StatusEffect[],
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'freeze', duration, 1, sourceId);
}

/** Apply curse (slow + damage reduction). */
export function applyCurse(
  effects: StatusEffect[],
  slowPercent: number,
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'curse', duration, slowPercent, sourceId);
}

/** Apply mark (increased damage taken). */
export function applyMark(
  effects: StatusEffect[],
  bonusDamagePercent: number,
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'mark', duration, bonusDamagePercent, sourceId);
}

/** Apply empower (increased speed and damage). */
export function applyEmpower(
  effects: StatusEffect[],
  speedBonus: number,
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'empower', duration, speedBonus, sourceId);
}

/** Apply intangible. */
export function applyIntangible(
  effects: StatusEffect[],
  duration: number,
  sourceId?: number,
): void {
  applyStatusEffect(effects, 'intangible', duration, 1, sourceId);
}
