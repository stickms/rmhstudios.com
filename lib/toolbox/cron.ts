/**
 * Five-field cron expressions (Vixie cron, as in crontab(5)), parsed to sets
 * and run forward to find the next times a schedule fires.
 *
 * Supported: `*`, numbers, ranges `a-b`, steps `*\/n` and `a-b/n`, lists, month
 * and weekday names, 7 as Sunday, and the `@hourly`…`@yearly` macros. As in
 * Vixie cron, when both day-of-month and day-of-week are restricted a day
 * matches if EITHER does — the rule people most often get wrong.
 */

export type CronField = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export const CRON_FIELDS: readonly CronField[] = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

const RANGES: Record<CronField, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7],
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const CRON_MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export interface ParsedCron {
  fields: Record<CronField, number[]>;
  /** Whether the field was `*` (or `*` with step 1): matters for the day-of-month / day-of-week rule. */
  wildcard: Record<CronField, boolean>;
  /** The five-field form, with any macro expanded. */
  expression: string;
}

export type CronError =
  | { code: 'field-count'; count: number }
  | { code: 'bad-value'; field: CronField; token: string }
  | { code: 'out-of-range'; field: CronField; token: string; min: number; max: number }
  | { code: 'bad-step'; field: CronField; token: string }
  | { code: 'unknown-macro'; token: string };

export type CronParseResult = { ok: true; cron: ParsedCron } | { ok: false; error: CronError };

function value(field: CronField, token: string): number | null {
  const upper = token.toUpperCase();
  if (field === 'month' && MONTHS.includes(upper)) return MONTHS.indexOf(upper) + 1;
  if (field === 'dayOfWeek' && DAYS.includes(upper)) return DAYS.indexOf(upper);
  return /^\d+$/.test(token) ? Number(token) : null;
}

function parseField(field: CronField, text: string): { values: number[]; wildcard: boolean } | CronError {
  const [min, max] = RANGES[field];
  const set = new Set<number>();
  let wildcard = false;
  for (const part of text.split(',')) {
    const [rangePart = '', stepPart] = part.split('/');
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) === 0) return { code: 'bad-step', field, token: part };
      step = Number(stepPart);
    }
    let lo: number;
    let hi: number;
    if (rangePart === '*') {
      lo = min;
      hi = max;
      if (step === 1) wildcard = true;
    } else {
      const [a = '', b] = rangePart.split('-');
      const av = value(field, a);
      const bv = b === undefined ? null : value(field, b);
      if (av === null || (b !== undefined && bv === null)) return { code: 'bad-value', field, token: part };
      lo = av;
      // `5/15` means from 5 to the end, in steps of 15.
      hi = bv ?? (stepPart !== undefined ? max : av);
      if (lo < min || hi > max || lo > max || hi < min) return { code: 'out-of-range', field, token: part, min, max };
      if (lo > hi) return { code: 'bad-value', field, token: part };
    }
    for (let v = lo; v <= hi; v += step) set.add(field === 'dayOfWeek' && v === 7 ? 0 : v);
  }
  return { values: [...set].sort((x, y) => x - y), wildcard };
}

export function parseCron(input: string): CronParseResult {
  let text = input.trim().replace(/\s+/g, ' ');
  if (text.startsWith('@')) {
    const macro = CRON_MACROS[text.toLowerCase()];
    if (!macro) return { ok: false, error: { code: 'unknown-macro', token: text } };
    text = macro;
  }
  const parts = text ? text.split(' ') : [];
  if (parts.length !== 5) return { ok: false, error: { code: 'field-count', count: parts.length } };
  const fields = {} as Record<CronField, number[]>;
  const wildcard = {} as Record<CronField, boolean>;
  for (let i = 0; i < 5; i++) {
    const field = CRON_FIELDS[i] as CronField;
    const r = parseField(field, parts[i] as string);
    if ('code' in r) return { ok: false, error: r };
    fields[field] = r.values;
    wildcard[field] = r.wildcard;
  }
  return { ok: true, cron: { fields, wildcard, expression: text } };
}

export type CronZone = 'local' | 'utc';

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  dow: number;
}

function partsOf(date: Date, zone: CronZone): Parts {
  return zone === 'utc'
    ? {
        y: date.getUTCFullYear(),
        mo: date.getUTCMonth() + 1,
        d: date.getUTCDate(),
        h: date.getUTCHours(),
        mi: date.getUTCMinutes(),
        dow: date.getUTCDay(),
      }
    : {
        y: date.getFullYear(),
        mo: date.getMonth() + 1,
        d: date.getDate(),
        h: date.getHours(),
        mi: date.getMinutes(),
        dow: date.getDay(),
      };
}

function dayMatches(cron: ParsedCron, p: Parts): boolean {
  const dom = cron.fields.dayOfMonth.includes(p.d);
  const dow = cron.fields.dayOfWeek.includes(p.dow);
  if (cron.wildcard.dayOfMonth && cron.wildcard.dayOfWeek) return true;
  if (cron.wildcard.dayOfMonth) return dow;
  if (cron.wildcard.dayOfWeek) return dom;
  return dom || dow;
}

export function matches(cron: ParsedCron, date: Date, zone: CronZone = 'local'): boolean {
  const p = partsOf(date, zone);
  return (
    cron.fields.minute.includes(p.mi) &&
    cron.fields.hour.includes(p.h) &&
    cron.fields.month.includes(p.mo) &&
    dayMatches(cron, p)
  );
}

/**
 * The next `count` times after `from` that the schedule fires. Walks forward
 * skipping whole days and hours that cannot match, and gives up after
 * `horizonYears` (an expression like `0 0 30 2 *` never fires).
 */
export function nextRuns(cron: ParsedCron, from: Date, count = 5, zone: CronZone = 'local', horizonYears = 5): Date[] {
  const out: Date[] = [];
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setTime(t.getTime() + 60_000);
  const end = from.getTime() + horizonYears * 366 * 86_400_000;
  while (out.length < count && t.getTime() <= end) {
    const p = partsOf(t, zone);
    if (!cron.fields.month.includes(p.mo) || !dayMatches(cron, p)) {
      // Jump to midnight of the next day in the zone (a local midnight lost to DST resolves forward).
      t.setTime(zone === 'utc' ? Date.UTC(p.y, p.mo - 1, p.d + 1) : new Date(p.y, p.mo - 1, p.d + 1).getTime());
      continue;
    }
    if (!cron.fields.hour.includes(p.h)) {
      t.setTime(t.getTime() + (60 - p.mi) * 60_000);
      continue;
    }
    if (cron.fields.minute.includes(p.mi)) {
      if (!out.some((d) => d.getTime() === t.getTime())) out.push(new Date(t.getTime()));
    }
    t.setTime(t.getTime() + 60_000);
  }
  return out;
}
