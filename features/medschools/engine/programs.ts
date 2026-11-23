/**
 * The program set (owner 2026-11-23): four independent toggles, MD, MD-PhD, DO and DO-PhD. Pure and client-safe; the
 * URL parsers, the preferences, the pages and the three public readers all use these functions, so a set means one
 * thing everywhere. All four on is "no filter" and the only set that includes events with no program reported.
 */

export const PROGRAM_KEYS = ['md', 'md-phd', 'do', 'do-phd'] as const;
export type ProgramKey = (typeof PROGRAM_KEYS)[number];

export type ProgramPair = { degree: 'MD' | 'DO'; program: 'REG' | 'PHD' };

const PAIRS: Record<ProgramKey, ProgramPair> = {
  md: { degree: 'MD', program: 'REG' },
  'md-phd': { degree: 'MD', program: 'PHD' },
  do: { degree: 'DO', program: 'REG' },
  'do-phd': { degree: 'DO', program: 'PHD' },
};

export const ALL_PROGRAMS: readonly ProgramKey[] = PROGRAM_KEYS;

export const programPair = (k: ProgramKey): ProgramPair => PAIRS[k];

export function programKey(degree: 'MD' | 'DO', program: 'REG' | 'PHD'): ProgramKey {
  return degree === 'MD' ? (program === 'REG' ? 'md' : 'md-phd') : program === 'REG' ? 'do' : 'do-phd';
}

/** The keys in canonical order, deduplicated; unknown values dropped. */
export function normalizePrograms(v: Iterable<unknown>): ProgramKey[] {
  const wanted = new Set<unknown>(v);
  return PROGRAM_KEYS.filter((k) => wanted.has(k));
}

export const isAllPrograms = (set: readonly ProgramKey[]): boolean => PROGRAM_KEYS.every((k) => set.includes(k));

/**
 * The set a URL (or an API query) names: a comma list, any case, any order (`programs=do,md-phd`), or `all`. Empty,
 * absent or wholly unknown input is `undefined` (the URL is silent); unknown words among known ones are dropped.
 */
export function parsePrograms(raw: unknown): ProgramKey[] | undefined {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const words = parts.map((p) => (typeof p === 'string' ? p.trim().toLowerCase() : '')).filter(Boolean);
  if (words.includes('all')) return [...PROGRAM_KEYS];
  const set = normalizePrograms(words);
  return set.length ? set : undefined;
}

/** The URL value of a set, in canonical order (so a cache key never depends on click order). */
export const programsValue = (set: readonly ProgramKey[]): string => normalizePrograms(set).join(',');

/** The public API's query value: omitted when every program is on (no filter), so the unfiltered cache key stays one. */
export const programsQueryValue = (set: readonly ProgramKey[]): string | undefined =>
  isAllPrograms(set) || set.length === 0 ? undefined : programsValue(set);

/**
 * The set the old `degree` and `program` parameters meant: a degree narrows to its two keys (none: both degrees), a
 * program to REG or PHD (ALL: both). A program with no degree used to read as All in the pages; it is representable
 * now (`PHD` alone is MD-PhD and DO-PhD).
 */
export function programsFromLegacy(
  degree: 'MD' | 'DO' | undefined,
  program: 'ALL' | 'REG' | 'PHD' | undefined,
): ProgramKey[] {
  return PROGRAM_KEYS.filter((k) => {
    const p = PAIRS[k];
    return (!degree || p.degree === degree) && (!program || program === 'ALL' || p.program === program);
  });
}

/** Press one: the last one that is on cannot be turned off. Canonical order. */
export function toggleProgramKey(set: readonly ProgramKey[], key: ProgramKey): ProgramKey[] {
  const on = new Set<ProgramKey>(normalizePrograms(set));
  if (on.has(key)) {
    if (on.size <= 1) return normalizePrograms(on);
    on.delete(key);
  } else on.add(key);
  return normalizePrograms(on);
}

/** Does a school of `degree` with an event or count of `program` (null: not reported) belong to the set? */
export function programsMatch(set: readonly ProgramKey[], degree: 'MD' | 'DO', program: 'REG' | 'PHD' | null): boolean {
  if (program === null) return isAllPrograms(set);
  return set.includes(programKey(degree, program));
}

/** The school page's `ALL | REG | PHD` for a school of `degree`, from a set: only that degree's two keys count. */
export function schoolProgramOf(set: readonly ProgramKey[], degree: 'MD' | 'DO'): 'ALL' | 'REG' | 'PHD' {
  const reg = set.includes(programKey(degree, 'REG'));
  const phd = set.includes(programKey(degree, 'PHD'));
  return reg === phd ? 'ALL' : reg ? 'REG' : 'PHD';
}

/** The legacy `programFilter` and `degree` columns for a set (kept in step so an older reader still makes sense). */
export function legacyOf(set: readonly ProgramKey[]): {
  programFilter: 'ALL' | 'REG' | 'PHD';
  degree: 'MD' | 'DO' | null;
} {
  const s = normalizePrograms(set);
  if (s.length === 0 || s.length === 4) return { programFilter: 'ALL', degree: null };
  const degrees = new Set(s.map((k) => PAIRS[k].degree));
  const programs = new Set(s.map((k) => PAIRS[k].program));
  const [d] = [...degrees];
  const [p] = [...programs];
  return {
    degree: degrees.size === 1 && d ? d : null,
    programFilter: programs.size === 1 && p ? p : 'ALL',
  };
}
