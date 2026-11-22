import { CHARTED_TYPES, SCHOOL_TABS, type SchoolTab } from './public-read';
import type { MedEventType, MedSource } from './types';

/** Hand-rolled `validateSearch` parsers: zod may not enter the entry. Unknown input falls back, never throws. */

export type ProgramFilter = 'ALL' | 'REG' | 'PHD';
export type LiveProgramFilter = ProgramFilter | 'NONE';

const ALL_TYPES: readonly MedEventType[] = [...CHARTED_TYPES, 'WITHDRAWN', 'HOLD'];
const SOURCES: readonly MedSource[] = ['CYCLETRACK', 'ADMIT', 'SDN', 'MDAPPLICANTS', 'RMH'];
const Q_MAX = 100;

/**
 * Values the parsers fall back to. The routes hand these to `stripSearchParams`, so a default never appears in the
 * URL: `/rmh-medschool` stays the canonical address and a shared link carries only what the viewer changed.
 */
export const INDEX_SEARCH_DEFAULTS = { program: 'ALL' } as const satisfies { program: ProgramFilter };
export const LIVE_SEARCH_DEFAULTS = { program: 'ALL' } as const satisfies { program: LiveProgramFilter };
/** `show` travels in the URL as a lowercase comma list (`show=interview,acceptance`), in `CHARTED_TYPES` order. */
export const showParam = (types: readonly MedEventType[]): string =>
  CHARTED_TYPES.filter((t) => types.includes(t))
    .map((t) => t.toLowerCase())
    .join(',');
export const SCHOOL_SEARCH_DEFAULTS = {
  tab: 'activity',
  program: 'ALL',
  type: 'INTERVIEW',
  show: showParam(CHARTED_TYPES),
} as const satisfies { tab: SchoolTab; program: ProgramFilter; type: MedEventType; show: string };

// The router JSON-parses what it can, so `?cycle=2026` or `?q=2026` reach a parser as numbers.
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const pick = <T extends string>(v: unknown, allowed: readonly T[], upper = true): T | undefined => {
  const s = str(v)?.trim();
  if (!s) return undefined;
  const k = upper ? s.toUpperCase() : s;
  return allowed.find((a) => a === k);
};
const program = (v: unknown): ProgramFilter => pick(v, ['ALL', 'REG', 'PHD'] as const) ?? 'ALL';
const degree = (v: unknown): 'MD' | 'DO' | undefined => pick(v, ['MD', 'DO'] as const, false);

export function parseIndexSearch(raw: Record<string, unknown>): {
  q?: string;
  degree?: 'MD' | 'DO';
  state?: string;
  program: ProgramFilter;
} {
  const q = str(raw.q)?.trim().slice(0, Q_MAX);
  const st = str(raw.state)?.trim();
  const d = degree(raw.degree);
  return {
    ...(q ? { q } : {}),
    ...(d ? { degree: d } : {}),
    ...(st && /^[A-Za-z]{2}$/.test(st) ? { state: st.toUpperCase() } : {}),
    program: program(raw.program),
  };
}

export function parseLiveSearch(raw: Record<string, unknown>): {
  type?: MedEventType;
  school?: string;
  degree?: 'MD' | 'DO';
  program: LiveProgramFilter;
} {
  const type = pick(raw.type, ALL_TYPES);
  const school = str(raw.school);
  const d = degree(raw.degree);
  return {
    ...(type ? { type } : {}),
    ...(school && /^[a-z0-9-]{1,80}$/.test(school) ? { school } : {}),
    ...(d ? { degree: d } : {}),
    program: pick(raw.program, ['ALL', 'REG', 'PHD', 'NONE'] as const) ?? 'ALL',
  };
}

export function parseSchoolSearch(raw: Record<string, unknown>): {
  tab: SchoolTab;
  program: ProgramFilter;
  show: MedEventType[];
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
  const source = pick(raw.source, SOURCES);
  const c = str(raw.cycle)?.trim();
  const cycle = c && /^\d{4}$/.test(c) ? Number(c) : undefined;
  return {
    tab: pick(raw.tab, SCHOOL_TABS, false) ?? 'activity',
    program: program(raw.program),
    show: shown.length ? shown : [...CHARTED_TYPES],
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
  show: string;
} {
  const { show, ...rest } = parseSchoolSearch(raw);
  return { ...rest, show: showParam(show) };
}
