import { describe, expect, it } from 'vitest';
import { extractNumberTokens, normalizeDigits, tokensEqual, type NumberToken } from './numbers';

const t = (s: string) => extractNumberTokens(s);
const tok = (kind: NumberToken['kind'], value: string): NumberToken => ({ kind, value });

describe('extractNumberTokens', () => {
  it('canonicalises numbers, percents and thousands separators', () => {
    expect(t('median 511, 3.70 GPA, 40% in-state, 1,200 reports')).toEqual([
      tok('number', '511'),
      tok('number', '3.7'),
      tok('percent', '40'),
      tok('number', '1200'),
    ]);
  });
  it('reads a range as two tokens', () => {
    expect(t('3.7-3.9')).toEqual([tok('number', '3.7'), tok('number', '3.9')]);
    expect(t('10-15%')).toEqual([tok('number', '10'), tok('percent', '15')]);
  });
  it('reads dates and cycle years', () => {
    expect(t('2026-11-21')).toEqual([tok('date', '2026-11-21')]);
    expect(t('Nov 21')).toEqual([tok('date', '11-21')]);
    expect(t('Nov. 21, 2026')).toEqual([tok('date', '2026-11-21')]);
    expect(t('21 November')).toEqual([tok('date', '11-21')]);
    expect(t('2026-2027')).toEqual([tok('year', '2026'), tok('year', '2027')]);
    expect(t('2026–2027')).toEqual([tok('year', '2026'), tok('year', '2027')]);
  });
  it('normalises Arabic-Indic, Persian and full-width digits', () => {
    expect(t('٥١١')).toEqual([tok('number', '511')]);
    expect(t('۵۱۱')).toEqual([tok('number', '511')]);
    expect(t('５１１')).toEqual([tok('number', '511')]);
    expect(normalizeDigits('٥٫٥')).toBe('5.5');
  });
  it('finds no number in words, names or number words', () => {
    expect(t('MMI Duke three')).toEqual([]);
    expect(t('COVID19 f12')).toEqual([]);
  });
  it('reads a number glued to a unit on its right', () => {
    expect(t('511MCAT')).toEqual([tok('number', '511')]);
  });
  it('turns an unmapped numeral into a token that can never match', () => {
    const tokens = t('५११ and ²');
    expect(tokens).toHaveLength(4);
    expect(tokens.every((x) => x.value.startsWith('?'))).toBe(true);
  });
});

describe('tokensEqual (claimed, allowed)', () => {
  it('is exact on value', () => {
    expect(tokensEqual(tok('number', '511'), tok('number', '511.5'))).toBe(false);
    expect(tokensEqual(tok('number', '3.7'), t('3.70')[0]!)).toBe(true);
  });
  it('keeps percent apart from a plain number', () => {
    expect(tokensEqual(tok('number', '40'), tok('percent', '40'))).toBe(false);
    expect(tokensEqual(tok('percent', '40'), tok('number', '40'))).toBe(false);
    expect(tokensEqual(tok('number', '0.4'), tok('percent', '40'))).toBe(false);
    expect(tokensEqual(tok('percent', '40'), tok('percent', '40'))).toBe(true);
  });
  it('treats a year and a number of the same value as equal', () => {
    expect(tokensEqual(tok('year', '2026'), tok('number', '2026'))).toBe(true);
    expect(tokensEqual(tok('year', '2026'), tok('year', '2027'))).toBe(false);
  });
  it('accepts a month-day claim from the same month-day in any form, never the reverse', () => {
    expect(tokensEqual(t('Nov 21')[0]!, t('2026-11-21')[0]!)).toBe(true);
    expect(tokensEqual(t('Nov 21')[0]!, t('Nov 21')[0]!)).toBe(true);
    expect(tokensEqual(t('Nov 22')[0]!, t('2026-11-21')[0]!)).toBe(false);
    expect(tokensEqual(t('2026-11-21')[0]!, t('Nov 21')[0]!)).toBe(false);
    expect(tokensEqual(t('2025-11-21')[0]!, t('2026-11-21')[0]!)).toBe(false);
    expect(tokensEqual(tok('date', '11-21'), tok('number', '11'))).toBe(false);
  });
});
