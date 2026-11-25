/**
 * A member's own applicant stats (phase D): the vocabulary and the rules, pure and client-safe, so the form, the zod
 * schema (`api/stats-schemas.ts`) and the builder agree. Every field is optional: a member enters only what they are
 * comfortable sharing. Nothing here reads or writes anything.
 */

export const HOURS_CATEGORIES = [
  'CLINICAL',
  'RESEARCH',
  'VOLUNTEER_CLINICAL',
  'VOLUNTEER_NONCLINICAL',
  'SHADOWING',
  'LEADERSHIP',
  'TEACHING',
] as const;
export type HoursCategory = (typeof HOURS_CATEGORIES)[number];

export const MISSIONS = [
  'research',
  'primary-care',
  'rural',
  'underserved',
  'urban',
  'global-health',
  'public-health',
  'academic-medicine',
] as const;
export type Mission = (typeof MISSIONS)[number];

export const POSTBACC_TYPES = ['FORMAL', 'INFORMAL'] as const;
export const GRADUATE_TYPES = ['SMP', 'MASTERS', 'OTHER'] as const;
export type PostbaccType = (typeof POSTBACC_TYPES)[number];
export type GraduateType = (typeof GRADUATE_TYPES)[number];

export const STATS_LIMITS = {
  attempts: 8,
  activitiesPerCategory: 10,
  activities: 40,
  note: 300,
  title: 80,
  hours: 20_000,
  count: 500,
  section: { min: 118, max: 132 },
  total: { min: 472, max: 528 },
  gpa: { min: 0, max: 4 },
  year: { min: 2010, max: 2100 },
} as const;

export const MCAT_SECTIONS = ['cpbs', 'cars', 'bbls', 'psbb'] as const;
export type McatSection = (typeof MCAT_SECTIONS)[number];

export interface McatAttempt {
  year: number;
  month: number;
  day: number | null;
  total: number | null;
  cpbs: number | null;
  cars: number | null;
  bbls: number | null;
  psbb: number | null;
}

export interface StatsActivity {
  title: string;
  hours: number | null;
  note: string | null;
}

export interface StatsHours {
  category: HoursCategory;
  hours: number | null;
  note: string | null;
  activities: StatsActivity[];
}

export interface ApplicantStats {
  mcat: McatAttempt[];
  gpa: {
    cumulative: number | null;
    science: number | null;
    postbacc: number | null;
    postbaccType: PostbaccType | null;
    graduate: number | null;
    graduateType: GraduateType | null;
  };
  hours: StatsHours[];
  /** The home-state preference (`MedUserPrefs.homeState`), not a column of the stats. */
  homeState: string | null;
  missions: Mission[];
  publications: number | null;
  presentations: number | null;
}

export const EMPTY_STATS: ApplicantStats = {
  mcat: [],
  gpa: { cumulative: null, science: null, postbacc: null, postbaccType: null, graduate: null, graduateType: null },
  hours: [],
  homeState: null,
  missions: [],
  publications: null,
  presentations: null,
};

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type AttemptProblem = 'date' | 'section' | 'total' | 'sum' | 'empty';

/**
 * What is wrong with an attempt, or null. A section is 118-132, a total 472-528, an attempt has a total or all four
 * sections, and when all four are given the total (if given) is their sum.
 */
export function attemptProblem(a: McatAttempt): AttemptProblem | null {
  const y = STATS_LIMITS.year;
  if (!Number.isInteger(a.year) || a.year < y.min || a.year > y.max) return 'date';
  if (!Number.isInteger(a.month) || a.month < 1 || a.month > 12) return 'date';
  if (a.day !== null && (!Number.isInteger(a.day) || a.day < 1 || a.day > daysInMonth(a.year, a.month))) return 'date';
  const s = STATS_LIMITS.section;
  const sections = MCAT_SECTIONS.map((k) => a[k]);
  if (sections.some((v) => v !== null && (!Number.isInteger(v) || v < s.min || v > s.max))) return 'section';
  const t = STATS_LIMITS.total;
  if (a.total !== null && (!Number.isInteger(a.total) || a.total < t.min || a.total > t.max)) return 'total';
  const all = sections.every((v) => v !== null);
  if (a.total === null && !all) return 'empty';
  if (all && a.total !== null && a.total !== sections.reduce<number>((n, v) => n + (v ?? 0), 0)) return 'sum';
  return null;
}

/** The attempt as stored: a missing total with all four sections is their sum. */
export function withTotal(a: McatAttempt): McatAttempt {
  if (a.total !== null) return a;
  const sections = MCAT_SECTIONS.map((k) => a[k]);
  if (sections.some((v) => v === null)) return a;
  return { ...a, total: sections.reduce<number>((n, v) => n + (v ?? 0), 0) };
}

const when = (a: McatAttempt): number => a.year * 10_000 + a.month * 100 + (a.day ?? 0);

/** The most recent attempt that has a total (by year, month, day; the later in the list wins a tie). */
export function latestMcat(attempts: readonly McatAttempt[]): McatAttempt | null {
  let best: McatAttempt | null = null;
  for (const a of attempts) {
    if (a.total === null) continue;
    if (!best || when(a) >= when(best)) best = a;
  }
  return best;
}

/** The totals of every attempt with a total except the most recent one (`latestMcat`), in the list's order. */
export function earlierMcatTotals(attempts: readonly McatAttempt[]): number[] {
  const latest = latestMcat(attempts);
  return attempts.flatMap((a) => (a !== latest && a.total !== null ? [a.total] : []));
}

/** A GPA is 0.00-4.00 with at most two decimals. */
export function gpaOk(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 4 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
}

/** Whether a member has entered anything at all (a stats row with nothing in it reads as none). */
export function hasAnyStats(s: ApplicantStats): boolean {
  const g = s.gpa;
  return (
    s.mcat.length > 0 ||
    [g.cumulative, g.science, g.postbacc, g.graduate].some((v) => v !== null) ||
    s.hours.some((h) => h.hours !== null || h.note !== null || h.activities.length > 0) ||
    s.missions.length > 0 ||
    s.publications !== null ||
    s.presentations !== null
  );
}
