/**
 * Score strings (PLAN §0.9, D-08).
 *
 * Lua sends `string.format('%.17g', x)`, or `inf`/`-inf`; NaN travels as
 * `inf`. TypeScript parses with `Number()` and compares as doubles; team sums
 * are double additions formatted back the same way. Anything that does not
 * parse is treated as NaN, and NaN is treated as +inf everywhere (that is
 * what the sender would have put on the wire).
 */

import type { ScoreStr } from '../types';

/** Parse a score string into a double. `inf`/`-inf` map to ±Infinity; NaN → +Infinity. */
export function parseScore(s: string | undefined | null): number {
  if (s === undefined || s === null) return 0;
  const t = s.trim();
  if (t === 'inf' || t === '+inf') return Infinity;
  if (t === '-inf') return -Infinity;
  if (t === '') return 0;
  const n = Number(t);
  return Number.isNaN(n) ? Infinity : n;
}

/**
 * Format a double exactly as C/Lua `%.17g` would (shortest-trailing form,
 * exponent with a sign and at least two digits), with the §0.9 rules for
 * the non-finite values.
 */
export function formatScore(n: number): ScoreStr {
  if (Number.isNaN(n) || n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (n === 0) return Object.is(n, -0) ? '-0' : '0';
  const exp = Number(n.toExponential(16).split('e')[1]);
  if (exp < -4 || exp >= 17) {
    const [mant = '0', e = '0'] = n.toExponential(16).split('e');
    const m = stripZeros(mant);
    const ev = Number(e);
    const sign = ev < 0 ? '-' : '+';
    const digits = String(Math.abs(ev)).padStart(2, '0');
    return `${m}e${sign}${digits}`;
  }
  return stripZeros(n.toFixed(Math.max(0, 16 - exp)));
}

function stripZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** −1 / 0 / 1 comparison of two score strings as doubles (NaN = +inf, so inf == NaN). */
export function compareScores(a: string, b: string): -1 | 0 | 1 {
  const x = parseScore(a);
  const y = parseScore(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

/** The larger of two score strings (the first on a tie). */
export function maxScore(a: string, b: string): string {
  return compareScores(b, a) > 0 ? b : a;
}

/** Double-addition sum of score strings, formatted back (Teams). */
export function sumScores(scores: readonly string[]): ScoreStr {
  let total = 0;
  for (const s of scores) total += parseScore(s);
  return formatScore(total);
}
