/**
 * Rolls from the character sheet (sprint 11, feature 02). Pure: no React, no storage, no network.
 *
 * There is no second dice parser. Notation goes through the Toolbox's `parseDice` and `roll` (`lib/toolbox/dice.ts`),
 * which sample with `crypto.getRandomValues` and rejection sampling. This file adds only the sheet's tighter limit and
 * the rules a sheet line needs: a d20 test with advantage and exhaustion, an attack with its critical rule, a damage
 * roll with doubled dice, and the Pathfinder 2e degree of success.
 */
import { parseDice, roll, type DiceParse, type RollResult, type Term } from '@/lib/toolbox/dice';
import { cryptoWords, type WordSource } from '@/lib/toolbox/random';

/** The sheet's own limit, checked after `parseDice` (the Toolbox allows 1,000 dice and 10,000 faces). */
export const SHEET_MAX_DICE = 50;
export const SHEET_MAX_SIDES = 100;

export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type Degree = 'critical-success' | 'success' | 'failure' | 'critical-failure';
export type FreeRollError = Extract<DiceParse, { ok: false }>['error'] | 'sheet-dice' | 'sheet-sides';

/** `null` when the terms fit the sheet; otherwise the limit they break. */
export function withinSheetLimits(terms: readonly Term[]): 'sheet-dice' | 'sheet-sides' | null {
  let dice = 0;
  for (const term of terms) {
    if (term.kind !== 'dice') continue;
    if (term.sides > SHEET_MAX_SIDES) return 'sheet-sides';
    dice += term.count;
  }
  return dice > SHEET_MAX_DICE ? 'sheet-dice' : null;
}

/** Where a term of the breakdown came from, so the sheet can label it. */
export type PartTag = 'dice' | 'modifier' | 'exhaustion';

export interface RollOutcome {
  total: number;
  result: RollResult;
  /** One tag per term of `result.terms`. */
  tags: PartTag[];
  mode: RollMode;
  /** The kept d20 face of a d20 test; `null` for damage and free rolls. */
  natural: number | null;
  /** 5e attack: a natural 20 (critical hit) and a natural 1 (miss). */
  critical: boolean;
  fumble: boolean;
  /** PF2e, only when a DC was given. */
  degree: Degree | null;
  /** PF2e critical Strike damage: the whole total is multiplied (x2), not just the dice. */
  multiplier?: number;
}

const D20: Record<RollMode, string> = { normal: '1d20', advantage: '2d20kh1', disadvantage: '2d20kl1' };

function diceTerms(notation: string): Term[] {
  const parsed = parseDice(notation);
  return parsed.ok ? parsed.terms : [];
}

function constant(value: number): Term {
  return { kind: 'constant', sign: value < 0 ? -1 : 1, value: Math.abs(value) };
}

/** Exhaustion's penalty to every d20 test (2024 rules, as the sheet's note says): −2 per level. */
export const exhaustionPenalty = (level: number) => Math.max(0, Math.floor(level)) * 2;

/** The step a degree moves by a natural 20 (up) or a natural 1 (down). */
export function degreeOfSuccess(total: number, natural: number, dc: number): Degree {
  const order: Degree[] = ['critical-failure', 'failure', 'success', 'critical-success'];
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (natural === 20) i = Math.min(3, i + 1);
  else if (natural === 1) i = Math.max(0, i - 1);
  return order[i] ?? 'failure';
}

export interface D20Options {
  bonus: number;
  mode?: RollMode;
  /** Exhaustion level (5e); applied as −2 per level. */
  exhaustion?: number;
  /** 5e attack: natural 20 is a critical hit, natural 1 a miss. */
  attack?: boolean;
  /** PF2e: the target DC; the outcome then carries a degree of success. */
  dc?: number;
}

/** A d20 test: the die (or two), the sheet's modifier, and exhaustion. */
export function rollD20(opts: D20Options, source: WordSource = cryptoWords): RollOutcome {
  const mode = opts.mode ?? 'normal';
  const terms: Term[] = diceTerms(D20[mode]);
  const tags: PartTag[] = ['dice'];
  if (opts.bonus !== 0) {
    terms.push(constant(opts.bonus));
    tags.push('modifier');
  }
  const penalty = exhaustionPenalty(opts.exhaustion ?? 0);
  if (penalty > 0) {
    terms.push(constant(-penalty));
    tags.push('exhaustion');
  }
  const result = roll(terms, source);
  const die = result.terms[0]?.dice.find((d) => d.kept);
  const natural = die?.value ?? 0;
  return {
    total: result.total,
    result,
    tags,
    mode,
    natural,
    critical: !!opts.attack && natural === 20,
    fumble: !!opts.attack && natural === 1,
    degree: opts.dc === undefined ? null : degreeOfSuccess(result.total, natural, opts.dc),
  };
}

/** The dice and flat modifier at the head of an attack's damage text (`1d8 +3 Slashing (1d10 two-handed)`). */
export function parseDamage(text: string): { notation: string; type: string } | null {
  const m = /^\s*((?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*)\s*(.*)$/i.exec(text);
  if (!m) return null;
  const type = (m[2] ?? '').replace(/\(.*?\)/g, '').trim();
  return { notation: (m[1] ?? '').replace(/\s+/g, ''), type };
}

/**
 * Damage for a sheet line. 5e `critical` doubles every dice term (never the flat modifier); PF2e `doubleTotal` (a
 * critical success on a Strike) rolls once and doubles the total. `null` if the text has no dice.
 */
export function rollDamage(
  text: string,
  opts: { critical?: boolean; doubleTotal?: boolean } = {},
  source: WordSource = cryptoWords,
): (RollOutcome & { type: string }) | null {
  const parsed = parseDamage(text);
  if (!parsed) return null;
  const base = parseDice(parsed.notation);
  if (!base.ok) return null;
  const terms = base.terms.map((term): Term =>
    term.kind === 'dice' && opts.critical ? { ...term, count: term.count * 2 } : term,
  );
  if (withinSheetLimits(terms)) return null;
  const result = roll(terms, source);
  const multiplier = opts.doubleTotal ? 2 : 1;
  return {
    total: result.total * multiplier,
    result,
    tags: terms.map((term) => (term.kind === 'dice' ? 'dice' : 'modifier')),
    mode: 'normal',
    natural: null,
    critical: false,
    fumble: false,
    degree: null,
    ...(opts.doubleTotal ? { multiplier } : {}),
    type: parsed.type,
  };
}

/** The free roll box: Toolbox notation, then the sheet's limit. */
export function rollFree(
  input: string,
  source: WordSource = cryptoWords,
): { ok: true; outcome: RollOutcome } | { ok: false; error: FreeRollError } {
  const parsed = parseDice(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const over = withinSheetLimits(parsed.terms);
  if (over) return { ok: false, error: over };
  const result = roll(parsed.terms, source);
  return {
    ok: true,
    outcome: {
      total: result.total,
      result,
      tags: parsed.terms.map((term) => (term.kind === 'dice' ? 'dice' : 'modifier')),
      mode: 'normal',
      natural: null,
      critical: false,
      fumble: false,
      degree: null,
    },
  };
}

/**
 * The roll written out: `d20 (14) + 5 = 19`, `2d20kh1 (14, [9]) + 5 - 2 (exhaustion) = 17`. A die dropped by a keep rule
 * is in square brackets. `labels.exhaustion` is the translated word for the penalty.
 */
export function formatOutcome(o: RollOutcome, labels: { exhaustion?: string } = {}): string {
  const parts = o.result.terms.map((tr, i) => {
    const { term } = tr;
    let body: string;
    if (term.kind === 'constant') {
      body = String(term.value);
      if (o.tags[i] === 'exhaustion' && labels.exhaustion) body += ` (${labels.exhaustion})`;
    } else {
      const keep = term.keep ? `${term.keep.mode}${term.keep.n}` : '';
      const faces = tr.dice.map((d) => (d.kept ? d.faces.join('+') : `[${d.faces.join('+')}]`)).join(', ');
      const shown = term.count === 1 && !keep ? `d${term.sides}` : `${term.count}d${term.sides}${keep}`;
      body = `${shown}${term.explode ? '!' : ''} (${faces})`;
    }
    return i === 0 ? `${term.sign === -1 ? '-' : ''}${body}` : `${term.sign === -1 ? '-' : '+'} ${body}`;
  });
  const body = parts.join(' ');
  return o.multiplier && o.multiplier > 1 ? `(${body}) x ${o.multiplier} = ${o.total}` : `${body} = ${o.total}`;
}
