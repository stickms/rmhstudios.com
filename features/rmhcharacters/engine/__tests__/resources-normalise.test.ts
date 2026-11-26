/** Old saves load with no uses spent; the normaliser keeps only sane numbers; the data finishes the clamp. */
import { describe, expect, it } from 'vitest';
import { DND5E_DATA } from '../dnd5e/data/index';
import { clampResourcesUsed, trackableResources, usesLeft } from '../dnd5e/rest';
import { newDnd5e, normalizeCharacter } from '../factory';
import type { Dnd5eCharacter } from '../types';

const load = (over: Record<string, unknown>): Dnd5eCharacter => {
  const out = normalizeCharacter({ ...newDnd5e(), ...over });
  if (!out || out.system !== 'dnd5e') throw new Error('not a 5e sheet');
  return out;
};

describe('resourcesUsed on load', () => {
  it('a new character has none spent', () => {
    expect(newDnd5e().resourcesUsed).toEqual({});
  });

  it('a save from before the feature loads with {} and every resource full', () => {
    const old: Record<string, unknown> = {
      ...newDnd5e(),
      classes: [{ classId: 'barbarian', level: 3, hpRolls: [null, null] }],
    };
    delete old.resourcesUsed;
    const c = normalizeCharacter(old) as Dnd5eCharacter;
    expect(c.resourcesUsed).toEqual({});
    for (const r of trackableResources(c, DND5E_DATA)) expect(usesLeft(c, r)).toBe(r.max);
  });

  it('drops values that are not whole positive numbers and non-record shapes', () => {
    expect(
      load({ resourcesUsed: { Rages: 2, Bad: 'x', Zero: 0, Neg: -3, Nan: Number.NaN, Frac: 1.9 } }).resourcesUsed,
    ).toEqual({
      Rages: 2,
      Frac: 1,
    });
    expect(load({ resourcesUsed: [1, 2] }).resourcesUsed).toEqual({});
    expect(load({ resourcesUsed: 'many' }).resourcesUsed).toEqual({});
  });

  it('caps the number of names and the size of a value', () => {
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`r${i}`, 1]));
    expect(Object.keys(load({ resourcesUsed: many }).resourcesUsed).length).toBeLessThanOrEqual(40);
    expect(load({ resourcesUsed: { Rages: 1e9 } }).resourcesUsed.Rages).toBe(999);
  });

  it('keeps spent Hit Dice only for real die sizes, as whole counts', () => {
    expect(load({ hitDiceSpent: { 10: 2.7, 8: 99, 7: 1, x: 3, 12: -1 } }).hitDiceSpent).toEqual({ 10: 2, 8: 20 });
    expect(load({}).hitDiceSpent).toBeUndefined();
  });

  it('unknown names drop and values clamp to the maximum once the class data is known', () => {
    const c = load({
      classes: [{ classId: 'barbarian', level: 3, hpRolls: [null, null] }],
      resourcesUsed: { Rages: 99, 'Wild Shape': 1, 'Rage Damage': 1 },
    });
    expect(clampResourcesUsed(c, DND5E_DATA)).toEqual({ Rages: 3 });
  });
});
