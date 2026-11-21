import { describe, expect, it } from 'vitest';
import { average, formatDice, parseDice, range, roll, type Term } from '@/lib/toolbox/dice';
import { seededWords } from '@/lib/toolbox/random';

const terms = (s: string): Term[] => {
  const r = parseDice(s);
  if (!r.ok) throw new Error(r.error);
  return r.terms;
};

describe('parseDice', () => {
  it('reads the common forms', () => {
    expect(formatDice(terms('2d6+3'))).toBe('2d6+3');
    expect(formatDice(terms('d20'))).toBe('1d20');
    expect(formatDice(terms('D%'))).toBe('1d100');
    expect(formatDice(terms(' 4d6 kh3 '))).toBe('4d6kh3');
    expect(formatDice(terms('1d8 + 1d6 - 1'))).toBe('1d8+1d6-1');
    expect(formatDice(terms('3d10!'))).toBe('3d10!');
  });

  it('rejects malformed and oversized input', () => {
    expect(parseDice('')).toEqual({ ok: false, error: 'empty' });
    expect(parseDice('2x6')).toMatchObject({ ok: false, error: 'syntax' });
    expect(parseDice('2d6++3')).toMatchObject({ ok: false, error: 'syntax' });
    expect(parseDice('1001d6')).toMatchObject({ ok: false, error: 'too-many-dice' });
    expect(parseDice('1d1')).toMatchObject({ ok: false, error: 'too-many-sides' });
    expect(parseDice('4d6kh5')).toMatchObject({ ok: false, error: 'bad-keep' });
    expect(parseDice('4d6dl4')).toMatchObject({ ok: false, error: 'bad-keep' });
    expect(parseDice(Array.from({ length: 21 }, () => '1').join('+'))).toMatchObject({ ok: false, error: 'too-many-terms' });
  });
});

describe('roll', () => {
  it('stays within the range and adds up', () => {
    const t = terms('3d6+2-1d4');
    const { min, max } = range(t);
    expect([min, max]).toEqual([1, 19]);
    for (let seed = 1; seed < 200; seed++) {
      const r = roll(t, seededWords(seed));
      expect(r.total).toBeGreaterThanOrEqual(min);
      expect(r.total).toBeLessThanOrEqual(max);
      expect(r.terms.reduce((a, x) => a + x.subtotal, 0)).toBe(r.total);
    }
  });

  it('keeps the highest dice', () => {
    for (let seed = 1; seed < 100; seed++) {
      const r = roll(terms('4d6kh3'), seededWords(seed));
      const dice = r.terms[0]?.dice ?? [];
      expect(dice.filter((d) => d.kept)).toHaveLength(3);
      const dropped = dice.find((d) => !d.kept);
      for (const d of dice.filter((x) => x.kept)) expect(d.value).toBeGreaterThanOrEqual(dropped?.value ?? 0);
    }
  });

  it('explodes on the maximum face', () => {
    // A source that always lands on the top face of a d2 explodes to the cap.
    const top = () => 1;
    const r = roll(terms('1d2!'), top);
    expect(r.terms[0]?.dice[0]?.faces.length).toBe(101);
    expect(range(terms('1d6!')).max).toBe(Infinity);
  });
});

describe('average', () => {
  it('is exact for plain dice and absent for non-linear rules', () => {
    expect(average(terms('2d6+3'))).toBe(10);
    expect(average(terms('1d20-1d4'))).toBe(8);
    expect(average(terms('4d6kh3'))).toBeNull();
  });
});
