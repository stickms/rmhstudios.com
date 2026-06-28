import { describe, it, expect } from 'vitest';
import {
  UPGRADE_DEFS,
  makePlayerStats,
  getUpgradeDef,
  rollUpgradeChoices,
  type UpgradeId,
} from '@/lib/void-breaker/upgrades';

describe('void-breaker upgrades', () => {
  it('starts from sane default stats', () => {
    const s = makePlayerStats();
    expect(s.fireRateMult).toBe(1);
    expect(s.projectileCount).toBe(1);
    expect(s.pierce).toBe(0);
    expect(s.critChance).toBe(0);
    expect(s.critMult).toBe(2);
  });

  it('every def is resolvable and has a positive stack cap', () => {
    for (const def of UPGRADE_DEFS) {
      expect(getUpgradeDef(def.id)).toBe(def);
      expect(def.maxStacks).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it('applies representative upgrades correctly', () => {
    const s = makePlayerStats();
    getUpgradeDef('rapid_fire')!.apply(s);
    expect(s.fireRateMult).toBeCloseTo(0.82);
    getUpgradeDef('multishot')!.apply(s);
    expect(s.projectileCount).toBe(2);
    getUpgradeDef('vitality')!.apply(s);
    expect(s.maxHpBonus).toBe(1);
  });

  it('caps siphon and deadeye at their ceilings even when over-stacked', () => {
    const s = makePlayerStats();
    const siphon = getUpgradeDef('siphon')!;
    const deadeye = getUpgradeDef('deadeye')!;
    for (let i = 0; i < 20; i++) { siphon.apply(s); deadeye.apply(s); }
    expect(s.lifestealChance).toBeLessThanOrEqual(0.4);
    expect(s.critChance).toBeLessThanOrEqual(0.75);
  });

  it('multiplicative upgrades commute (order-independent re-application)', () => {
    // Re-applying stacks in any order must reproduce the same stats — this is
    // what makes save/load re-derivation correct.
    const a = makePlayerStats();
    getUpgradeDef('rapid_fire')!.apply(a);
    getUpgradeDef('velocity')!.apply(a);
    const b = makePlayerStats();
    getUpgradeDef('velocity')!.apply(b);
    getUpgradeDef('rapid_fire')!.apply(b);
    expect(a.fireRateMult).toBeCloseTo(b.fireRateMult);
    expect(a.projSpeedMult).toBeCloseTo(b.projSpeedMult);
  });

  it('rolls up to 3 distinct, non-maxed choices', () => {
    const choices = rollUpgradeChoices({}, 3, false);
    expect(choices.length).toBe(3);
    const ids = new Set(choices.map((c) => c.id));
    expect(ids.size).toBe(choices.length); // all distinct
  });

  it('excludes maxed-out upgrades from the pool', () => {
    // Max every upgrade except one; that one must always be offered.
    const stacks: Partial<Record<UpgradeId, number>> = {};
    let spared: UpgradeId | null = null;
    for (const def of UPGRADE_DEFS) {
      if (spared === null) { spared = def.id; continue; }
      stacks[def.id] = def.maxStacks;
    }
    const choices = rollUpgradeChoices(stacks, 3, false);
    expect(choices.length).toBe(1);
    expect(choices[0].id).toBe(spared);
  });

  it('returns an empty roll when everything is maxed', () => {
    const stacks: Partial<Record<UpgradeId, number>> = {};
    for (const def of UPGRADE_DEFS) stacks[def.id] = def.maxStacks;
    expect(rollUpgradeChoices(stacks, 3, false)).toHaveLength(0);
  });

  it('reports the owned stack count on each choice', () => {
    const choices = rollUpgradeChoices({ rapid_fire: 2 }, UPGRADE_DEFS.length, false);
    const rf = choices.find((c) => c.id === 'rapid_fire');
    expect(rf?.owned).toBe(2);
  });
});
