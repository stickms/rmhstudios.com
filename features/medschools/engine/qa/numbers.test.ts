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
    expect(t('MMI Duke MD-PhD')).toEqual([]);
    expect(t('Duke no one knows')).toEqual([]);
  });
  it('reads every digit run, whatever precedes it (a letter is no cover)', () => {
    // The validator's old lookbehind made digits glued to a letter invisible: CJK has no spaces, Arabic has prefixes.
    expect(t('MCAT中央値は999です')).toEqual([tok('number', '999')]);
    expect(t('中位数是999')).toEqual([tok('number', '999')]);
    expect(t('ب٩٩٩')).toEqual([tok('number', '999')]);
    expect(t('وال٩٩٩')).toEqual([tok('number', '999')]);
    expect(t('abc999')).toEqual([tok('number', '999')]);
    expect(t('COVID19 f12')).toEqual([tok('number', '19'), tok('number', '12')]);
    expect(t('Hangul filler\u3164999')).toEqual([tok('number', '999')]);
    expect(t('x\u200b999')).toEqual([tok('number', '999')]);
    expect(t('中2026-11-21')).toEqual([tok('date', '2026-11-21')]);
    expect(t('中2026年')).toEqual([tok('year', '2026')]);
  });
  it('keeps MD-PhD and the en-dash cycle range sane', () => {
    expect(t('MD-PhD, 2026\u20132027')).toEqual([tok('year', '2026'), tok('year', '2027')]);
    expect(t('2026\u22122027')).toEqual([tok('year', '2026'), tok('year', '2027')]);
  });
  it('keeps k, per cent and a leading minus part of the token', () => {
    expect(t('120k')).toEqual([tok('number', '120k')]);
    expect(t('120 K')).toEqual([tok('number', '120k')]);
    expect(t('120 per cent')).toEqual([tok('percent', '120')]);
    expect(t('120 percent')).toEqual([tok('percent', '120')]);
    expect(t('-8%')).toEqual([tok('percent', '-8')]);
    expect(t('down \u22128%')).toEqual([tok('percent', '-8')]);
    expect(t('(-3.5)')).toEqual([tok('number', '-3.5')]);
    expect(t('3.7-3.9')).toEqual([tok('number', '3.7'), tok('number', '3.9')]);
    expect(t('120 Kids')).toEqual([tok('number', '120')]);
    expect(tokensEqual(tok('number', '120k'), tok('number', '120'))).toBe(false);
    expect(tokensEqual(tok('percent', '-8'), tok('percent', '8'))).toBe(false);
  });
  it('reads number words as numbers', () => {
    expect(t('five hundred nineteen')).toEqual([tok('number', '519')]);
    expect(t('twenty-one and ninety-nine')).toEqual([tok('number', '21'), tok('number', '99')]);
    expect(t('a dozen')).toEqual([tok('number', '12')]);
    expect(t('two thousand')).toEqual([tok('number', '2000')]);
    expect(t('fifty percent')).toEqual([tok('percent', '50')]);
    expect(t('half of them')).toEqual([tok('number', '?half')]);
    expect(t('one hundred')).toEqual([tok('number', '100')]);
    expect(t('cincuenta, 五百, ثلاثة')).toHaveLength(3);
    expect(t('Stanford ستانفورد')).toEqual([]);
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
