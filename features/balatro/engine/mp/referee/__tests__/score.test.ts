/** §0.9 score format: parse, `%.17g` formatting, comparison, team sums (R-17). */
import { describe, expect, it } from 'vitest';
import { zScoreStr } from '../../types';
import { compareScores, formatScore, maxScore, parseScore, sumScores } from '../score';

describe('parseScore', () => {
  it.each([
    ['0', 0],
    ['123', 123],
    ['-5', -5],
    ['1.5', 1.5],
    ['1e+308', 1e308],
    ['1.7976931348623157e+308', Number.MAX_VALUE],
    ['inf', Infinity],
    ['+inf', Infinity],
    ['-inf', -Infinity],
    ['', 0],
    ['  42 ', 42],
  ])('%s → %s', (s, n) => expect(parseScore(s)).toBe(n));

  it('NaN and garbage parse as +inf (NaN travels as inf)', () => {
    expect(parseScore('nan')).toBe(Infinity);
    expect(parseScore('abc')).toBe(Infinity);
  });
  it('missing is 0', () => {
    expect(parseScore(undefined)).toBe(0);
    expect(parseScore(null)).toBe(0);
  });
});

describe('formatScore (%.17g)', () => {
  it.each([
    [0, '0'],
    [-0, '-0'],
    [1, '1'],
    [100, '100'],
    [123456, '123456'],
    [0.1, '0.10000000000000001'],
    [1.5, '1.5'],
    [1e16, '10000000000000000'],
    [1e17, '1e+17'],
    [123456789012345680000, '1.2345678901234568e+20'],
    [1e308, '1e+308'],
    [Number.MAX_VALUE, '1.7976931348623157e+308'],
    [1e-5, '1.0000000000000001e-05'],
    [0.0001, '0.0001'],
    [-2.5, '-2.5'],
    [Infinity, 'inf'],
    [-Infinity, '-inf'],
    [NaN, 'inf'],
  ])('%s → %s', (n, s) => {
    expect(formatScore(n)).toBe(s);
    expect(zScoreStr.safeParse(formatScore(n)).success).toBe(true);
  });

  it('round-trips through parseScore exactly for finite doubles', () => {
    for (const n of [0, 1, 7, 0.1, 1 / 3, 2 ** 53, 2 ** 53 + 2, 1e100, 5e-324, 123.456, 9.95]) {
      expect(parseScore(formatScore(n))).toBe(n);
    }
  });
});

describe('compareScores / maxScore / sumScores', () => {
  it('compares as doubles, mixing plain and exponent forms', () => {
    expect(compareScores('100000000000000000', '1e+17')).toBe(0);
    expect(compareScores('99', '1e+2')).toBe(-1);
    expect(compareScores('2e+20', '199999999999999999999')).toBe(0);
    expect(compareScores('inf', '1e+308')).toBe(1);
    expect(compareScores('-inf', '0')).toBe(-1);
    expect(compareScores('inf', 'inf')).toBe(0);
    expect(compareScores('inf', 'nan')).toBe(0);
  });
  it('maxScore keeps the first on a tie', () => {
    expect(maxScore('10', '20')).toBe('20');
    expect(maxScore('20', '10')).toBe('20');
    expect(maxScore('1e+2', '100')).toBe('1e+2');
  });
  it('sums with double addition', () => {
    expect(sumScores(['1', '2', '3'])).toBe('6');
    expect(sumScores([])).toBe('0');
    expect(sumScores(['1e+308', '1e+308'])).toBe('inf');
    expect(sumScores(['inf', '-inf'])).toBe('inf');
    expect(sumScores(['0.1', '0.2'])).toBe('0.30000000000000004');
  });
});
