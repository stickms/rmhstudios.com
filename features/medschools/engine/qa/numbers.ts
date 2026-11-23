/**
 * Number tokens in free text, canonicalised so "3.70" and "3.7" agree and "40%" never equals "40" or "0.4".
 * Pure. The grounding validator (`ground.ts`) compares the tokens of a sentence with the tokens of the facts it cites.
 */

import { numberWordTokens } from './number-words';

export type NumberToken = { kind: 'number' | 'percent' | 'date' | 'year'; value: string };

/** Zero code points of the digit blocks we map to ASCII. */
const DIGIT_ZEROS = [0x0660, 0x06f0, 0xff10];

/** Arabic-Indic, Extended Arabic-Indic (Persian) and full-width digits become ASCII; so do their separators and percent signs. */
export function normalizeDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    let mapped: string | null = null;
    for (const zero of DIGIT_ZEROS) {
      if (cp >= zero && cp <= zero + 9) {
        mapped = String(cp - zero);
        break;
      }
    }
    if (mapped === null) {
      if (cp === 0x066b) mapped = '.';
      else if (cp === 0x066c) mapped = ',';
      else if (cp === 0x066a || cp === 0xff05 || cp === 0xfe6a) mapped = '%';
      else if (cp === 0x2212) mapped = '-';
      else if (cp === 0xff0e) mapped = '.';
      else if (cp === 0xff0c) mapped = ',';
      else if (cp === 0xff0d) mapped = '-';
    }
    out += mapped ?? ch;
  }
  return out;
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};
const MONTH_RE =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

// A digit run is a number whatever letter precedes it (CJK has no spaces, Arabic glues prefixes on): only a neighbouring
// digit changes where a token starts or ends.
const ISO_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/gu;
// "Nov 21", "Nov 21st", "Nov. 21, 2026", "21 Nov"
const MD_RE = new RegExp(
  `(?:(?<![\\p{L}\\p{N}_])(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?|(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:,?\\s+(20\\d{2}))?)(?![\\p{L}\\p{N}_])`,
  'giu',
);
// An optional sign (a minus that starts a word, not the hyphen of a range or a compound), the digit run, and the suffix
// that changes what the number is: a percent ("%", "percent", "per cent"), thousands ("120k") or millions ("1.2M").
const NUM_RE =
  /((?<=^|[\s([{:;,/=])-)?(\d+(?:\.\d+)?)(\s?%|\s?per\s?cent(?![\p{L}])|\s?percent(?![\p{L}])|\s?[kK](?![\p{L}\p{N}])|[mM](?![\p{L}\p{N}]))?/giu;
/** Any numeral we do not map (Devanagari, superscripts, circled, fractions): it can never be verified, so it is a token. */
const OTHER_NUMERAL_RE = /(?![0-9])\p{N}/gu;

const pad2 = (s: string) => s.padStart(2, '0');
const validMd = (m: string, d: string) => {
  const n = Number(d);
  return n >= 1 && n <= 31 && m.length === 2;
};

/**
 * Canonical number tokens of `text`, in reading order within each kind (dates, then percents/numbers/years).
 * `'3.7-3.9'` is two tokens; `'2026-2027'` two years; a bare date `Nov 21` is the date token `11-21` and
 * `'2026-11-21'` the date token `2026-11-21`. Every maximal digit run is a number whatever precedes it (`COVID19` is
 * `19`, `中央値は999` is `999`, `511MCAT` is `511`); a leading minus is part of the token (`-8%` is not `8%`), `120k`
 * is not `120`, `120 per cent` is a percent, and number words ("five hundred") are read by `number-words.ts`.
 */
export function extractNumberTokens(text: string): NumberToken[] {
  // Format characters (bidi controls, zero-width) carry no meaning of their own and split or hide digits.
  let s = normalizeDigits(text).replace(/\p{Cf}/gu, '');
  // "1,200" -> "1200"
  s = s.replace(/(?<=\d),(?=\d{3}(?!\d))/g, '');
  const out: NumberToken[] = [];

  s = s.replace(ISO_RE, (whole, y: string, m: string, d: string) => {
    const mo = Number(m);
    if (mo < 1 || mo > 12 || !validMd(m, d)) return whole;
    out.push({ kind: 'date', value: `${y}-${m}-${d}` });
    return ' ';
  });
  s = s.replace(MD_RE, (_w, m1?: string, d1?: string, y1?: string, d2?: string, m2?: string, y2?: string) => {
    const mon = MONTHS[(m1 ?? m2 ?? '').slice(0, 3).toLowerCase()];
    const day = d1 ?? d2 ?? '';
    const year = y1 ?? y2;
    if (!mon || !validMd(mon, day)) return _w;
    out.push({ kind: 'date', value: year ? `${year}-${mon}-${pad2(day)}` : `${mon}-${pad2(day)}` });
    return ' ';
  });
  s = s.replace(NUM_RE, (_w, sign: string | undefined, n: string, suffix?: string) => {
    const value = `${sign ? '-' : ''}${Number(n).toString()}`;
    const unit = suffix?.trim().toLowerCase();
    if (unit === 'k' || unit === 'm') out.push({ kind: 'number', value: `${value}${unit}` });
    else if (unit) out.push({ kind: 'percent', value });
    else out.push({ kind: /^20\d{2}$/.test(n) && !sign ? 'year' : 'number', value });
    return ' ';
  });
  for (const m of s.matchAll(OTHER_NUMERAL_RE)) out.push({ kind: 'number', value: `?${m[0]}` });
  out.push(...numberWordTokens(s));
  return out;
}

/**
 * Is the claimed token `a` (from the sentence) supported by the allowed token `b` (from a cited fact)?
 * Percent only equals percent ("40%" is not "40" and not "0.4"); a number equals a year of the same value (a four-digit
 * count in 2000-2099 reads as either). A month-day claim (`11-21`) is supported by the same month-day in any form, ISO
 * with a year included; an ISO date claim needs the exact ISO date. The relation is deliberately not symmetric.
 */
export function tokensEqual(a: NumberToken, b: NumberToken): boolean {
  if (a.kind === 'date' || b.kind === 'date') {
    if (a.kind !== 'date' || b.kind !== 'date') return false;
    const aFull = a.value.length === 10;
    const bFull = b.value.length === 10;
    if (aFull) return bFull && a.value === b.value;
    return a.value === (bFull ? b.value.slice(5) : b.value);
  }
  if (a.kind === 'percent' || b.kind === 'percent') return a.kind === b.kind && a.value === b.value;
  return a.value === b.value;
}
