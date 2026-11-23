import { CHARTED_TYPES, SCHOOL_TABS, type SchoolTab } from './public-read';
import type { MedEventType, MedSource } from './types';

/** Hand-rolled `validateSearch` parsers: zod may not enter the entry. Unknown input falls back, never throws. */

export type ProgramFilter = 'ALL' | 'REG' | 'PHD';
export type LiveProgramFilter = ProgramFilter | 'NONE';

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
export const SCHOOL_SEARCH_DEFAULTS = {
  tab: 'activity',
  type: 'INTERVIEW',
} as const satisfies { tab: SchoolTab; type: MedEventType };

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

export function parseIndexSearch(raw: Record<string, unknown>): {
  q?: string;
  degree?: 'MD' | 'DO' | 'ALL';
  state?: string;
  program?: ProgramFilter;
} {
  const q = str(raw.q)?.trim().slice(0, Q_MAX);
  const st = str(raw.state)?.trim();
  const d = degree(raw.degree);
  const p = program(raw.program);
  return {
    ...(q ? { q } : {}),
    ...(d ? { degree: d } : {}),
    ...(st && /^[A-Za-z]{2}$/.test(st) ? { state: st.toUpperCase() } : {}),
    // Phase 3 read a program without a degree as All here; that now belongs to the effective view (`resolveView`),
    // because a preference may supply the degree.
    ...(p ? { program: p } : {}),
  };
}

export function parseLiveSearch(raw: Record<string, unknown>): {
  type?: MedEventType;
  school?: string;
  degree?: 'MD' | 'DO' | 'ALL';
  program?: LiveProgramFilter;
} {
  const type = pick(raw.type, ALL_TYPES);
  const school = str(raw.school);
  const d = degree(raw.degree);
  const p = pick(raw.program, ['ALL', 'REG', 'PHD', 'NONE'] as const);
  return {
    ...(type ? { type } : {}),
    ...(school && /^[a-z0-9-]{1,80}$/.test(school) ? { school } : {}),
    ...(d ? { degree: d } : {}),
    ...(p ? { program: p } : {}),
  };
}

export function parseSchoolSearch(raw: Record<string, unknown>): {
  tab: SchoolTab;
  program?: ProgramFilter;
  /** Absent when the URL names no known category: a preference may fill it, else every category. */
  show?: MedEventType[];
  type: MedEventType;
  source?: MedSource;
  cycle?: number;
} {
  const wanted = new Set(
    (str(raw.show) ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  const shown = CHARTED_TYPES.filter((t) => wanted.has(t));
  const prog = program(raw.program);
  const source = pick(raw.source, SOURCES);
  const c = str(raw.cycle)?.trim();
  const cycle = c && /^\d{4}$/.test(c) && Number(c) >= CYCLE_MIN && Number(c) <= CYCLE_MAX ? Number(c) : undefined;
  return {
    tab: pick(raw.tab, SCHOOL_TABS, false) ?? 'activity',
    ...(prog ? { program: prog } : {}),
    ...(shown.length ? { show: shown } : {}),
    type: pick(raw.type, CHARTED_TYPES) ?? 'INTERVIEW',
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
  'show'
> & {
  show?: string;
} {
  const { show, ...rest } = parseSchoolSearch(raw);
  return { ...rest, ...(show ? { show: showParam(show) } : {}) };
}

/** The tracker page's search: the cycle year to show (the newest the user has when absent). */
export function parseTrackerSearch(raw: Record<string, unknown>): { cycle?: number } {
  const c = str(raw.cycle)?.trim();
  return c && /^\d{4}$/.test(c) && Number(c) >= CYCLE_MIN && Number(c) <= CYCLE_MAX ? { cycle: Number(c) } : {};
}
