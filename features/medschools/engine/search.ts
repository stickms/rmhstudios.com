import { CHARTED_TYPES, SCHOOL_TABS, type SchoolTab } from './public-read';
import { parsePrograms, programsFromLegacy, programsValue, type ProgramKey } from './programs';
import type { MedEventType, MedSource } from './types';

/** Hand-rolled `validateSearch` parsers: zod may not enter the entry. Unknown input falls back, never throws. */

export type ProgramFilter = 'ALL' | 'REG' | 'PHD';

const ALL_TYPES: readonly MedEventType[] = [...CHARTED_TYPES, 'WITHDRAWN', 'HOLD'];
const SOURCES: readonly MedSource[] = ['CYCLETRACK', 'ADMIT', 'SDN', 'MDAPPLICANTS', 'RMH'];
/** Matches the API's `q` limit (read-schemas), so a URL the page accepts is one the endpoint accepts. */
export const Q_MAX = 80;
/** The API's `cycle` range (read-schemas). */
const CYCLE_MIN = 2000;
const CYCLE_MAX = 2100;

/**
 * Values handed to `stripSearchParams`. `program`, `degree` and `show` are NOT among them (plan D14): a preference can
 * fill them where the URL is silent, so `?program=ALL` must survive as "I chose All" and be told from an absent key.
 * The pages' write helper (`writeSearch` in `prefs.ts`) drops a value only when it equals the global default and no
 * preference would override it.
 */
export const INDEX_SEARCH_DEFAULTS = {} as const;
export const LIVE_SEARCH_DEFAULTS = {} as const;
/** `show` travels in the URL as a lowercase comma list (`show=interview,acceptance`), in `CHARTED_TYPES` order. */
export const showParam = (types: readonly MedEventType[]): string =>
  CHARTED_TYPES.filter((t) => types.includes(t))
    .map((t) => t.toLowerCase())
    .join(',');
/** The Interviews tab's sub-tabs (`?itab=`); Overview is the default and is never written to the URL. */
export const INTERVIEW_TABS = ['overview', 'questions', 'format', 'practice'] as const;
export type InterviewTab = (typeof INTERVIEW_TABS)[number];
export const SCHOOL_SEARCH_DEFAULTS = {
  tab: 'activity',
  type: 'INTERVIEW',
  itab: 'overview',
} as const satisfies { tab: SchoolTab; type: MedEventType; itab: InterviewTab };

// The router JSON-parses what it can, so `?cycle=2026` or `?q=2026` reach a parser as numbers.
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const pick = <T extends string>(v: unknown, allowed: readonly T[], upper = true): T | undefined => {
  const s = str(v)?.trim();
  if (!s) return undefined;
  const k = upper ? s.toUpperCase() : s;
  return allowed.find((a) => a === k);
};
/** Absent (or malformed) stays absent: only a value in the URL is the viewer's choice. */
const program = (v: unknown): ProgramFilter | undefined => pick(v, ['ALL', 'REG', 'PHD'] as const);
/** `ALL` is the explicit "every degree": the one way a link can override a degree preference. */
const degree = (v: unknown): 'MD' | 'DO' | 'ALL' | undefined => pick(v, ['MD', 'DO', 'ALL'] as const, false);

/**
 * The program set a URL names: `programs=md,do-phd`, else the old `degree` and `program` parameters mapped onto it
 * (back-compatible links keep working), else `undefined` (the URL is silent: a preference may fill it).
 */
function programSetOf(raw: Record<string, unknown>): ProgramKey[] | undefined {
  const named = parsePrograms(raw.programs);
  if (named) return named;
  const d = degree(raw.degree);
  const p = program(raw.program);
  if (!d && !p) return undefined;
  return programsFromLegacy(d === 'MD' || d === 'DO' ? d : undefined, p);
}

/** A saved-list filter (index and live): one list id, or `all` (every list of the signed-in viewer). */
const listParam = (v: unknown): string | undefined => {
  const s = str(v)?.trim();
  return s && /^[a-z0-9]{1,40}$/.test(s) ? s : undefined;
};
/**
 * `source=cycletrack|admit` (owner 2026-11-24): which source the totals and primary series follow. Any case. The school
 * page's `source` (History's picker: any source, upper case) is read through it too, so `ADMIT` there is the choice.
 */
export const parseSourcePref = (v: unknown): 'cycletrack' | 'admit' | undefined =>
  pick(str(v)?.toLowerCase(), ['cycletrack', 'admit'] as const, false);
/** `mine=cycle`: the schools of the signed-in viewer's current tracker cycle (`engine/mine.ts`). */
const mineParam = (v: unknown): 'cycle' | undefined => (str(v)?.trim().toLowerCase() === 'cycle' ? 'cycle' : undefined);

/** The most states one filter names (the API's cap too). */
export const MAX_STATES = 10;

/**
 * `state=CA,NY` (owner 2026-11-24: several states at once): two-letter codes, upper-cased, deduped, sorted, at most
 * `MAX_STATES`; an old single-state link (`state=CA`) is a list of one. Empty means every state. The API checks each
 * code against the known list.
 */
export function parseStates(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  return [
    ...new Set(
      s
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z]{2}$/.test(x)),
    ),
  ]
    .sort()
    .slice(0, MAX_STATES);
}

export function parseIndexSearch(raw: Record<string, unknown>): {
  q?: string;
  states?: string[];
  programs?: ProgramKey[];
  list?: string;
  mine?: 'cycle';
  source?: 'cycletrack' | 'admit';
} {
  const q = str(raw.q)?.trim().slice(0, Q_MAX);
  const states = parseStates(raw.state);
  const programs = programSetOf(raw);
  const list = listParam(raw.list);
  const mine = mineParam(raw.mine);
  const source = parseSourcePref(raw.source);
  return {
    ...(q ? { q } : {}),
    ...(states.length ? { states } : {}),
    ...(programs ? { programs } : {}),
    ...(list ? { list } : {}),
    ...(mine ? { mine } : {}),
    ...(source ? { source } : {}),
  };
}

/**
 * What the index and live routes' `validateSearch` return: the parsed search with `programs` back as the comma list,
 * because the router would write an array into the URL as JSON and a link would not read back.
 */
export function validateIndexSearch(raw: Record<string, unknown>): Omit<
  ReturnType<typeof parseIndexSearch>,
  'programs' | 'states'
> & {
  programs?: string;
  state?: string;
} {
  const { programs, states, ...rest } = parseIndexSearch(raw);
  return {
    ...rest,
    ...(states ? { state: states.join(',') } : {}),
    ...(programs ? { programs: programsValue(programs) } : {}),
  };
}

export function parseLiveSearch(raw: Record<string, unknown>): {
  type?: MedEventType;
  school?: string;
  states?: string[];
  programs?: ProgramKey[];
  list?: string;
  mine?: 'cycle';
} {
  const type = pick(raw.type, ALL_TYPES);
  const school = str(raw.school);
  const states = parseStates(raw.state);
  const programs = programSetOf(raw);
  const list = listParam(raw.list);
  const mine = mineParam(raw.mine);
  return {
    ...(type ? { type } : {}),
    ...(school && /^[a-z0-9-]{1,80}$/.test(school) ? { school } : {}),
    ...(states.length ? { states } : {}),
    ...(programs ? { programs } : {}),
    ...(list ? { list } : {}),
    ...(mine ? { mine } : {}),
  };
}

export function validateLiveSearch(raw: Record<string, unknown>): Omit<
  ReturnType<typeof parseLiveSearch>,
  'programs' | 'states'
> & {
  programs?: string;
  state?: string;
} {
  const { programs, states, ...rest } = parseLiveSearch(raw);
  return {
    ...rest,
    ...(states ? { state: states.join(',') } : {}),
    ...(programs ? { programs: programsValue(programs) } : {}),
  };
}

/** A comma list of charted categories (`interview,acceptance`), case-insensitive, back in `CHARTED_TYPES` order. */
function typeList(v: unknown): MedEventType[] {
  const wanted = new Set(
    (str(v) ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  return CHARTED_TYPES.filter((t) => wanted.has(t));
}

export function parseSchoolSearch(raw: Record<string, unknown>): {
  tab: SchoolTab;
  program?: ProgramFilter;
  /** Absent when the URL names no known category: a preference may fill it, else every category. */
  show?: MedEventType[];
  /**
   * The categories the "by day" chart stacks (owner 2026-11-24), `daily=interview,acceptance` in `CHARTED_TYPES`
   * order; one value (`daily=interview`) is a list of one. Absent (or naming no known category) means every category.
   */
  daily?: MedEventType[];
  type: MedEventType;
  source?: MedSource;
  cycle?: number;
  itab: InterviewTab;
} {
  const shown = typeList(raw.show);
  const daily = typeList(raw.daily);
  const prog = program(raw.program);
  const source = pick(raw.source, SOURCES);
  const c = str(raw.cycle)?.trim();
  const cycle = c && /^\d{4}$/.test(c) && Number(c) >= CYCLE_MIN && Number(c) <= CYCLE_MAX ? Number(c) : undefined;
  return {
    tab: pick(raw.tab, SCHOOL_TABS, false) ?? 'activity',
    ...(prog ? { program: prog } : {}),
    ...(shown.length ? { show: shown } : {}),
    ...(daily.length ? { daily } : {}),
    type: pick(raw.type, CHARTED_TYPES) ?? 'INTERVIEW',
    itab: pick(raw.itab, INTERVIEW_TABS, false) ?? 'overview',
    ...(source ? { source } : {}),
    ...(cycle !== undefined ? { cycle } : {}),
  };
}

/**
 * What the school route's `validateSearch` returns: `parseSchoolSearch` with `show` back as the comma list, because the
 * router would write an array into the URL as JSON (`show=["INTERVIEW"]`) and a link would not read back. Pages read
 * the typed list with `parseSchoolSearch`.
 */
export function validateSchoolSearch(raw: Record<string, unknown>): Omit<
  ReturnType<typeof parseSchoolSearch>,
  'show' | 'daily'
> & {
  show?: string;
  daily?: string;
} {
  const { show, daily, ...rest } = parseSchoolSearch(raw);
  return {
    ...rest,
    ...(show ? { show: showParam(show) } : {}),
    // Every category is the default: the key is dropped so the canonical link stays short.
    ...(daily && daily.length < CHARTED_TYPES.length ? { daily: showParam(daily) } : {}),
  };
}

/** The tracker page's search: the cycle year to show (the newest the user has when absent). */
export function parseTrackerSearch(raw: Record<string, unknown>): { cycle?: number } {
  const c = str(raw.cycle)?.trim();
  return c && /^\d{4}$/.test(c) && Number(c) >= CYCLE_MIN && Number(c) <= CYCLE_MAX ? { cycle: Number(c) } : {};
}

/** The Ask page's search: an optional `q` that fills the field and never submits (at most 400 characters, control characters turned to spaces). */
export function parseAskSearch(raw: Record<string, unknown>): { q?: string } {
  const text = str(raw.q);
  if (text === undefined) return {};
  const clean = Array.from(text, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('');
  const q = clean.trim().slice(0, 400);
  return q ? { q } : {};
}
