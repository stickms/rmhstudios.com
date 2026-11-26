/** Class resources and rests: every recharge text maps to a rule, and the rests give back exactly what they should. */
import { describe, expect, it } from 'vitest';
import { DND5E_DATA } from '../dnd5e/data/index';
import * as R from '../dnd5e/rules';
import {
  KNOWN_RECHARGE_TEXTS,
  applyLongRest,
  applyShortRest,
  clampResourcesUsed,
  hitDiceLeft,
  hitDieHealing,
  isKnownRecharge,
  rechargeRule,
  setUsesLeft,
  trackableResources,
  usesLeft,
} from '../dnd5e/rest';
import { newDnd5e } from '../factory';
import type { Dnd5eCharacter } from '../types';

const D = DND5E_DATA;

function hero(classes: [string, number][], over: Partial<Dnd5eCharacter> = {}): Dnd5eCharacter {
  return {
    ...newDnd5e(),
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: classes.map(([classId, level]) => ({ classId, level, hpRolls: Array(Math.max(0, level - 1)).fill(null) })),
    ...over,
  };
}

const named = (c: Dnd5eCharacter, name: string) => {
  const r = trackableResources(c, D).find((x) => x.name === name);
  if (!r) throw new Error(`no resource ${name}`);
  return r;
};

describe('recharge text', () => {
  const texts = new Set<string>();
  for (const k of D.classes) for (const r of k.resources ?? []) if (r.recharge) texts.add(r.recharge);

  it('every distinct recharge text in the class data is a known rule', () => {
    const unknown = [...texts].filter((x) => !isKnownRecharge(x));
    expect(unknown, `new recharge text needs a rule in rest.ts: ${unknown.join(' | ')}`).toEqual([]);
  });

  it('every known text is still used by the data', () => {
    for (const known of KNOWN_RECHARGE_TEXTS) expect(texts.has(known), known).toBe(true);
  });

  it('maps each text to what the two rests give back', () => {
    expect(rechargeRule('Long Rest', 5)).toEqual({ short: 'none', long: 'all' });
    expect(rechargeRule('Short Rest', 5)).toEqual({ short: 'all', long: 'all' });
    expect(rechargeRule('Long Rest (one use back on a Short Rest)', 5)).toEqual({ short: 'one', long: 'all' });
    expect(rechargeRule('Long Rest (Short Rest from level 5)', 4)).toEqual({ short: 'none', long: 'all' });
    expect(rechargeRule('Long Rest (Short Rest from level 5)', 5)).toEqual({ short: 'all', long: 'all' });
  });

  it('treats text it does not know as long-rest-all', () => {
    expect(isKnownRecharge('Dawn')).toBe(false);
    expect(rechargeRule('Dawn', 1)).toEqual({ short: 'none', long: 'all' });
  });
});

describe('trackable resources', () => {
  it('tracks counted resources with a recharge and leaves dice and fixed figures read-only', () => {
    const names = trackableResources(hero([['barbarian', 6]]), D).map((r) => r.name);
    expect(names).toEqual(['Rages']);
    const bard = trackableResources(hero([['bard', 5]]), D).map((r) => r.name);
    expect(bard).toEqual([]); // Bardic Inspiration is a die value
  });

  it('leaves the pact slots to the spell slots', () => {
    expect(trackableResources(hero([['warlock', 5]]), D).map((r) => r.name)).not.toContain('Pact Magic Slots');
  });

  it('omits a resource that is 0 at this level', () => {
    expect(trackableResources(hero([['cleric', 1]]), D)).toEqual([]);
  });
});

describe('a level 6 barbarian', () => {
  it('has 4 Rages at level 6, using two leaves two, a short rest gives one back, a long rest all', () => {
    let c = hero([['barbarian', 6]]);
    const rages = named(c, 'Rages');
    expect(rages.max).toBe(4);
    expect(usesLeft(c, rages)).toBe(4);
    c = setUsesLeft(c, rages, 2);
    expect(usesLeft(c, rages)).toBe(2);
    c = applyShortRest(c, D, { spent: {}, healing: 0 });
    expect(usesLeft(c, rages)).toBe(3);
    c = applyLongRest(setUsesLeft(c, rages, 1), D);
    expect(usesLeft(c, rages)).toBe(4);
    expect(c.resourcesUsed).toEqual({});
  });

  it('a level 3 barbarian reads 3 of 3 and loses two on use', () => {
    const c = hero([['barbarian', 3]]);
    const rages = named(c, 'Rages');
    expect(rages.max).toBe(3);
    expect(usesLeft(setUsesLeft(c, rages, 1), rages)).toBe(1);
  });
});

describe('a level 5 bard', () => {
  it('slots do not come back on a short rest, a long rest restores them', () => {
    const c = hero([['bard', 5]], {
      spells: { known: [], prepared: [], slotsUsed: [2, 1, 0, 0, 0, 0, 0, 0, 0], pactSlotsUsed: 0 },
    });
    expect(applyShortRest(c, D, { spent: {}, healing: 0 }).spells.slotsUsed.slice(0, 2)).toEqual([2, 1]);
    expect(applyLongRest(c, D).spells.slotsUsed.every((n) => n === 0)).toBe(true);
  });
});

describe('a cleric', () => {
  it('gets one Channel Divinity use back on a short rest', () => {
    let c = hero([['cleric', 6]]);
    const cd = named(c, 'Channel Divinity');
    expect(cd.max).toBe(3);
    c = setUsesLeft(c, cd, 0);
    c = applyShortRest(c, D, { spent: {}, healing: 0 });
    expect(usesLeft(c, cd)).toBe(1);
  });
});

describe('a fighter 5 / warlock 3', () => {
  const base = () =>
    hero(
      [
        ['fighter', 5],
        ['warlock', 3],
      ],
      {
        baseAbilities: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 12 },
        spells: { known: [], prepared: [], slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactSlotsUsed: 2 },
      },
    );

  it('restores Action Surge fully, Second Wind by one, and every pact slot', () => {
    let c = base();
    c = setUsesLeft(c, named(c, 'Action Surge'), 0);
    c = setUsesLeft(c, named(c, 'Second Wind'), 0);
    const after = applyShortRest(c, D, { spent: {}, healing: 0 });
    expect(usesLeft(after, named(after, 'Action Surge'))).toBe(1);
    expect(usesLeft(after, named(after, 'Second Wind'))).toBe(1);
    expect(after.spells.pactSlotsUsed).toBe(0);
    expect(trackableResources(after, D).map((r) => r.name)).not.toContain('Indomitable'); // from level 9
  });

  it('has Hit Dice by size: d10 and d8, the smallest spent first', () => {
    const c = base();
    expect(hitDiceLeft(c, D)).toEqual([
      { die: 10, count: 5, left: 5 },
      { die: 8, count: 3, left: 3 },
    ]);
    expect(hitDiceLeft({ ...c, hitDiceUsed: 4 }, D)).toEqual([
      { die: 10, count: 5, left: 4 },
      { die: 8, count: 3, left: 0 },
    ]);
  });

  it('keeps the size of each die a rest spends, so a d10 spent leaves the d8s alone', () => {
    let c = applyShortRest({ ...base(), hp: { current: 10, temp: 0 } }, D, { spent: { 10: 2 }, healing: 9 });
    expect(hitDiceLeft(c, D)).toEqual([
      { die: 10, count: 5, left: 3 },
      { die: 8, count: 3, left: 3 },
    ]);
    c = applyShortRest(c, D, { spent: { 8: 1 }, healing: 4 });
    expect(c.hitDiceUsed).toBe(3);
    expect(hitDiceLeft(c, D)).toEqual([
      { die: 10, count: 5, left: 3 },
      { die: 8, count: 3, left: 2 },
    ]);
    // A long rest gives back four (half of eight), the largest first.
    const rested = applyLongRest(c, D);
    expect(rested.hitDiceUsed).toBe(0);
    expect(hitDiceLeft(rested, D).every((p) => p.left === p.count)).toBe(true);
    const partly = applyLongRest({ ...base(), hitDiceUsed: 7, hitDiceSpent: { 10: 4, 8: 3 } }, D);
    expect(hitDiceLeft(partly, D)).toEqual([
      { die: 10, count: 5, left: 5 },
      { die: 8, count: 3, left: 0 },
    ]);
  });

  it('spends two Hit Dice, heals what was rolled, never over max HP', () => {
    const c = { ...base(), hp: { current: 10, temp: 0 } };
    const max = R.maxHp(c, D);
    const spent = applyShortRest(c, D, { spent: { 10: 2 }, healing: 9 });
    expect(spent.hitDiceUsed).toBe(2);
    expect(spent.hp.current).toBe(19);
    const over = applyShortRest(c, D, { spent: { 10: 2 }, healing: 999 });
    expect(over.hp.current).toBe(max);
  });

  it('never spends more dice than are left, and never below zero', () => {
    const c = { ...base(), hitDiceUsed: 7, hp: { current: 5, temp: 0 } };
    const r = applyShortRest(c, D, { spent: { 10: 9, 8: 9 }, healing: 10 });
    expect(r.hitDiceUsed).toBe(8);
    expect(r.hitDiceUsed).toBeLessThanOrEqual(8);
    const free = applyShortRest({ ...c, hitDiceUsed: 8 }, D, { spent: { 10: 3 }, healing: 10 });
    expect(free.hitDiceUsed).toBe(8);
    expect(free.hp.current).toBe(5); // no die spent, no healing
    expect(applyShortRest(c, D, { spent: { 10: -3 }, healing: -5 }).hitDiceUsed).toBe(7);
  });

  it('a die gives at least 1', () => {
    expect(hitDieHealing(-2)).toBe(1);
    expect(hitDieHealing(0)).toBe(1);
    expect(hitDieHealing(7)).toBe(7);
  });

  it('a long rest restores half the Hit Dice and one exhaustion', () => {
    const c = { ...base(), hitDiceUsed: 8, exhaustion: 2 };
    const r = applyLongRest(c, D);
    expect(r.hitDiceUsed).toBe(4);
    expect(r.exhaustion).toBe(1);
    expect(r.hp.current).toBe(R.maxHp(c, D));
  });

  it('healing from 0 HP clears the death saves', () => {
    const c = { ...base(), hp: { current: 0, temp: 0 }, deathSaves: { successes: 1, failures: 2 } };
    expect(applyShortRest(c, D, { spent: { 10: 1 }, healing: 6 }).deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});

describe('uses are clamped to what the character has', () => {
  it('drops unknown names and clamps to the maximum', () => {
    const c = hero([['barbarian', 3]], { resourcesUsed: { Rages: 9, 'Wild Shape': 2, Nonsense: 1 } });
    expect(clampResourcesUsed(c, D)).toEqual({ Rages: 3 });
    expect(usesLeft(c, named(c, 'Rages'))).toBe(0);
  });
});
