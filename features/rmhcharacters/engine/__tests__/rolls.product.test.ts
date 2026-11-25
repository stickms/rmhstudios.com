import { describe, expect, it } from 'vitest';
import { parseDice } from '@/lib/toolbox/dice';
import type { WordSource } from '@/lib/toolbox/random';
import * as R5 from '@features/rmhcharacters/engine/dnd5e/rules';
import {
  degreeOfSuccess,
  formatOutcome,
  parseDamage,
  rollD20,
  rollDamage,
  rollFree,
  withinSheetLimits,
} from '@features/rmhcharacters/engine/rolls';

/** A source that yields faces in order: a word w gives face (w % sides) + 1, so pass face - 1 for sides that divide 2^32. */
function faces(...f: number[]): WordSource {
  let i = 0;
  return () => (f[i++ % f.length] ?? 1) - 1;
}

const terms = (s: string) => {
  const p = parseDice(s);
  if (!p.ok) throw new Error(s);
  return p.terms;
};

describe('the sheet limit', () => {
  it('refuses 51 dice and a d101, accepts 3d6+2', () => {
    expect(withinSheetLimits(terms('51d6'))).toBe('sheet-dice');
    expect(withinSheetLimits(terms('25d6+26d4'))).toBe('sheet-dice');
    expect(withinSheetLimits(terms('1d101'))).toBe('sheet-sides');
    expect(withinSheetLimits(terms('50d100'))).toBeNull();
    expect(rollFree('3d6+2').ok).toBe(true);
  });

  it('refuses 3d6*2 as syntax, with the parser reason', () => {
    expect(rollFree('3d6*2')).toEqual({ ok: false, error: 'syntax' });
    expect(rollFree('')).toEqual({ ok: false, error: 'empty' });
    expect(rollFree('51d6')).toEqual({ ok: false, error: 'sheet-dice' });
  });
});

describe('d20 tests', () => {
  it('adds the same modifier the sheet shows for a skill', () => {
    const skill = { bonus: 5 };
    const o = rollD20({ bonus: skill.bonus }, faces(10));
    expect(o.natural).toBe(10);
    expect(o.total).toBe(15);
    expect(formatOutcome(o)).toBe('d20 (10) + 5 = 15');
  });

  it('matches R.signed for the engine skill bonus', () => {
    expect(R5.signed(5)).toBe('+5');
    expect(rollD20({ bonus: -1 }, faces(4)).total).toBe(3);
  });

  it('advantage rolls two d20 and keeps the higher; disadvantage the lower', () => {
    const adv = rollD20({ bonus: 5, mode: 'advantage' }, faces(14, 9));
    expect(adv.result.terms[0]?.dice.map((d) => d.value)).toEqual([14, 9]);
    expect(adv.natural).toBe(14);
    expect(adv.total).toBe(19);
    expect(formatOutcome(adv)).toBe('2d20kh1 (14, [9]) + 5 = 19');
    const dis = rollD20({ bonus: 5, mode: 'disadvantage' }, faces(14, 9));
    expect(dis.natural).toBe(9);
    expect(dis.total).toBe(14);
  });

  it('applies exhaustion at -2 per level and shows it', () => {
    const o = rollD20({ bonus: 5, exhaustion: 2 }, faces(10));
    expect(o.total).toBe(11);
    expect(formatOutcome(o, { exhaustion: 'exhaustion' })).toBe('d20 (10) + 5 - 4 (exhaustion) = 11');
  });

  it('a natural 20 attack is a critical hit and a natural 1 is a miss', () => {
    expect(rollD20({ bonus: 3, attack: true }, faces(20)).critical).toBe(true);
    const miss = rollD20({ bonus: 30, attack: true }, faces(1));
    expect(miss.fumble).toBe(true);
    expect(miss.critical).toBe(false);
    expect(rollD20({ bonus: 3 }, faces(20)).critical).toBe(false);
  });
});

describe('damage', () => {
  it('reads the dice and modifier from the sheet text', () => {
    expect(parseDamage('1d8 +3 Slashing (1d10 two-handed)')).toEqual({ notation: '1d8+3', type: 'Slashing' });
    expect(parseDamage('2d6 -1 piercing')).toEqual({ notation: '2d6-1', type: 'piercing' });
    expect(parseDamage('1 Bludgeoning')).toEqual({ notation: '1', type: 'Bludgeoning' });
    expect(parseDamage('Bludgeoning')).toBeNull();
  });

  it('a critical doubles the dice, not the modifier', () => {
    const normal = rollDamage('1d8 +3 Slashing', {}, faces(5));
    expect(normal?.total).toBe(8);
    const crit = rollDamage('1d8 +3 Slashing', { critical: true }, faces(5));
    expect(crit?.result.terms[0]?.dice).toHaveLength(2);
    expect(crit?.total).toBe(13);
    expect(crit?.type).toBe('Slashing');
  });

  it('a critical doubles every dice term of a mixed expression', () => {
    const crit = rollDamage('1d8+2d6+3', { critical: true }, faces(1));
    const counts = crit?.result.terms.filter((t) => t.term.kind === 'dice').map((t) => t.dice.length);
    expect(counts).toEqual([2, 4]);
    expect(crit?.total).toBe(2 + 4 + 3);
  });

  it('a PF2e critical success doubles the total, modifier included', () => {
    const normal = rollDamage('1d8 +3 slashing', {}, faces(5));
    expect(normal?.total).toBe(8);
    const crit = rollDamage('1d8 +3 slashing', { doubleTotal: true }, faces(5));
    expect(crit?.total).toBe(16);
    expect(crit?.result.terms[0]?.dice).toHaveLength(1);
    expect(formatOutcome(crit!)).toBe('(1d8 (5) + 3) x 2 = 16'.replace('1d8', 'd8'));
  });
});

describe('PF2e degrees of success', () => {
  it('covers the four bands against a DC of 20', () => {
    expect(degreeOfSuccess(30, 10, 20)).toBe('critical-success');
    expect(degreeOfSuccess(20, 10, 20)).toBe('success');
    expect(degreeOfSuccess(19, 10, 20)).toBe('failure');
    expect(degreeOfSuccess(10, 10, 20)).toBe('critical-failure');
  });

  it('a natural 20 steps up and a natural 1 steps down, within the ends', () => {
    expect(degreeOfSuccess(19, 20, 20)).toBe('success');
    expect(degreeOfSuccess(25, 20, 20)).toBe('critical-success');
    expect(degreeOfSuccess(30, 20, 20)).toBe('critical-success');
    expect(degreeOfSuccess(20, 1, 20)).toBe('failure');
    expect(degreeOfSuccess(5, 1, 20)).toBe('critical-failure');
  });

  it('a roll carries a degree only when a DC is given', () => {
    expect(rollD20({ bonus: 10 }, faces(10)).degree).toBeNull();
    expect(rollD20({ bonus: 10, dc: 20 }, faces(10)).degree).toBe('success');
  });
});
