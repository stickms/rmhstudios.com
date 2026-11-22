/**
 * Dice notation, as tabletop players write it: `2d6+3`, `4d6kh3`, `d20`,
 * `3d10!`, `d%`, `1d8 + 1d6 - 1`.
 *
 * Supported per dice term: `kh`/`kl` keep the highest or lowest N, `dh`/`dl`
 * drop them, and `!` explodes (a die that shows its maximum is rolled again and
 * added, up to `MAX_EXPLOSIONS` times). Limits keep a typo like `1000d1000000`
 * from freezing the page.
 */

import { randomInt, type WordSource, cryptoWords } from '@/lib/toolbox/random';

export const MAX_DICE = 1000;
export const MAX_SIDES = 10_000;
export const MAX_TERMS = 20;
export const MAX_EXPLOSIONS = 100;

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'kh' | 'kl' | 'dh' | 'dl'; n: number };
  explode: boolean;
}

export interface ConstantTerm {
  kind: 'constant';
  sign: 1 | -1;
  value: number;
}

export type Term = DiceTerm | ConstantTerm;

export type DiceParse =
  | { ok: true; terms: Term[] }
  | {
      ok: false;
      error: 'empty' | 'syntax' | 'too-many-dice' | 'too-many-sides' | 'too-many-terms' | 'bad-keep';
      at?: string;
    };

const TERM = /^(\d*)d(\d+|%)((?:kh|kl|dh|dl)\d+)?(!)?$|^(\d+)$/;

export function parseDice(input: string): DiceParse {
  const s = input.toLowerCase().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'empty' };
  const parts = s.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join('') !== s) return { ok: false, error: 'syntax' };
  if (parts.length > MAX_TERMS) return { ok: false, error: 'too-many-terms' };
  const terms: Term[] = [];
  for (const raw of parts) {
    const sign: 1 | -1 = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[+-]/, '');
    const m = TERM.exec(body);
    if (!m) return { ok: false, error: 'syntax', at: body };
    if (m[5] !== undefined) {
      terms.push({ kind: 'constant', sign, value: Number(m[5]) });
      continue;
    }
    const count = m[1] ? Number(m[1]) : 1;
    const sides = m[2] === '%' ? 100 : Number(m[2]);
    if (count < 1 || count > MAX_DICE) return { ok: false, error: 'too-many-dice', at: body };
    if (sides < 2 || sides > MAX_SIDES) return { ok: false, error: 'too-many-sides', at: body };
    const term: DiceTerm = { kind: 'dice', sign, count, sides, explode: m[4] === '!' };
    if (m[3]) {
      const mode = m[3].slice(0, 2) as 'kh' | 'kl' | 'dh' | 'dl';
      const n = Number(m[3].slice(2));
      if (n < 1 || n > count || ((mode === 'dh' || mode === 'dl') && n >= count)) {
        return { ok: false, error: 'bad-keep', at: body };
      }
      term.keep = { mode, n };
    }
    terms.push(term);
  }
  return { ok: true, terms };
}

export interface Die {
  /** The faces rolled for this die: more than one when it exploded. */
  faces: number[];
  value: number;
  kept: boolean;
}

export interface TermResult {
  term: Term;
  dice: Die[];
  subtotal: number;
}

export interface RollResult {
  total: number;
  terms: TermResult[];
}

function keptIndices(values: number[], keep: DiceTerm['keep']): Set<number> {
  const order = values.map((v, i) => ({ v, i }));
  if (!keep) return new Set(order.map((o) => o.i));
  const asc = [...order].sort((a, b) => a.v - b.v || a.i - b.i);
  const n = keep.n;
  const pick =
    keep.mode === 'kh'
      ? asc.slice(-n)
      : keep.mode === 'kl'
        ? asc.slice(0, n)
        : keep.mode === 'dh'
          ? asc.slice(0, asc.length - n)
          : asc.slice(n);
  return new Set(pick.map((o) => o.i));
}

export function roll(terms: readonly Term[], source: WordSource = cryptoWords): RollResult {
  const results: TermResult[] = [];
  let total = 0;
  for (const term of terms) {
    if (term.kind === 'constant') {
      results.push({ term, dice: [], subtotal: term.sign * term.value });
      total += term.sign * term.value;
      continue;
    }
    const raw: number[][] = [];
    for (let i = 0; i < term.count; i++) {
      const faces = [randomInt(term.sides, source) + 1];
      while (term.explode && faces[faces.length - 1] === term.sides && faces.length <= MAX_EXPLOSIONS) {
        faces.push(randomInt(term.sides, source) + 1);
      }
      raw.push(faces);
    }
    const values = raw.map((f) => f.reduce((a, b) => a + b, 0));
    const kept = keptIndices(values, term.keep);
    const dice = raw.map((faces, i) => ({ faces, value: values[i] ?? 0, kept: kept.has(i) }));
    const subtotal = term.sign * dice.filter((d) => d.kept).reduce((a, d) => a + d.value, 0);
    results.push({ term, dice, subtotal });
    total += subtotal;
  }
  return { total, terms: results };
}

/** The lowest and highest possible totals; `max` is `Infinity` when a term explodes. */
export function range(terms: readonly Term[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const term of terms) {
    if (term.kind === 'constant') {
      min += term.sign * term.value;
      max += term.sign * term.value;
      continue;
    }
    const keptCount = !term.keep
      ? term.count
      : term.keep.mode === 'kh' || term.keep.mode === 'kl'
        ? term.keep.n
        : term.count - term.keep.n;
    const lo = keptCount;
    const hi = term.explode ? Infinity : keptCount * term.sides;
    if (term.sign === 1) {
      min += lo;
      max += hi;
    } else {
      min -= hi;
      max -= lo;
    }
  }
  return { min, max };
}

/** The average total, exact for plain dice; `null` when a keep rule or an explosion makes it non-linear. */
export function average(terms: readonly Term[]): number | null {
  let sum = 0;
  for (const term of terms) {
    if (term.kind === 'constant') sum += term.sign * term.value;
    else if (term.keep || term.explode) return null;
    else sum += (term.sign * term.count * (term.sides + 1)) / 2;
  }
  return sum;
}

/** The expression written back in canonical form (`2d6+3`). */
export function formatDice(terms: readonly Term[]): string {
  return terms
    .map((term, i) => {
      const sign = term.sign === -1 ? '-' : i === 0 ? '' : '+';
      if (term.kind === 'constant') return `${sign}${term.value}`;
      const keep = term.keep ? `${term.keep.mode}${term.keep.n}` : '';
      return `${sign}${term.count}d${term.sides}${keep}${term.explode ? '!' : ''}`;
    })
    .join('');
}
