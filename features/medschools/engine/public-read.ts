import { cycleYearOf, dayOfCycle } from './cycle';
import type { MedEventType, MedSource } from './types';

/** Client-safe, no I/O. Rules for what the public pages may show (spec §6, §10). */

/** Primary series choice order: the first source present (after the floor) is primary. */
export const PRIMARY_ORDER: readonly MedSource[] = ['CYCLETRACK', 'ADMIT', 'SDN', 'RMH', 'MDAPPLICANTS'];
export const CHARTED_TYPES: readonly MedEventType[] = ['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'];
export const K_FLOOR = 3;
export const SOURCE_NAMES: Record<MedSource, string> = {
  CYCLETRACK: 'CycleTrack',
  ADMIT: 'Admit.org',
  SDN: 'Student Doctor Network',
  RMH: 'RMH tracker',
  MDAPPLICANTS: 'MDApplicants',
};

/** Column heads and phone end labels, where the full name does not fit. Proper nouns, not translated. */
export const SHORT_SOURCE_NAMES: Record<MedSource, string> = {
  CYCLETRACK: 'CycleTrack',
  ADMIT: 'Admit',
  SDN: 'SDN',
  RMH: 'RMH',
  MDAPPLICANTS: 'MDApplicants',
};

export type SchoolTab = 'activity' | 'history' | 'forecast' | 'interviews' | 'secondaries';
export const SCHOOL_TABS: readonly SchoolTab[] = ['activity', 'history', 'forecast', 'interviews', 'secondaries'];

export interface CountCell {
  source: MedSource;
  /** YYYY-MM-DD */
  date: string;
  count: number;
  contributors: number | null;
}
export interface TypeSeries {
  primary: MedSource | null;
  sources: { source: MedSource; days: { date: string; count: number }[]; total: number }[];
}

export function pickPrimary(present: Iterable<MedSource>): MedSource | null {
  const set = new Set(present);
  return PRIMARY_ORDER.find((s) => set.has(s)) ?? null;
}

/** The UTC calendar day of `now`, `YYYY-MM-DD`. */
export const utcDayOf = (now: Date): string => now.toISOString().slice(0, 10);

/** A stored count row as the readers select it: the live figures and, for RMH only, the daily snapshot. */
export interface StoredCountRow {
  source: MedSource;
  /** YYYY-MM-DD */
  date: string;
  eventType: MedEventType;
  count: number;
  contributors: number | null;
  publishedCount?: number | null;
  publishedContributors?: number | null;
}

/**
 * The row as a public figure (Q2). An RMH row is public only through its daily snapshot: `publishedCount` and
 * `publishedContributors` stand in for `count` and `contributors`, and a row never published (null) is absent. The live
 * columns follow the tracker minute by minute and are never shown, so a back-dated milestone cannot move a public figure
 * until the next snapshot. Other sources pass through unchanged.
 */
export function publicCell<T extends StoredCountRow>(
  r: T,
): (Omit<T, 'publishedCount' | 'publishedContributors'> & CountCell) | null {
  const { publishedCount, publishedContributors, ...rest } = r;
  if (r.source !== 'RMH') return rest as Omit<T, 'publishedCount' | 'publishedContributors'> & CountCell;
  if (publishedCount === null || publishedCount === undefined) return null;
  return { ...rest, count: publishedCount, contributors: publishedContributors ?? null };
}

/**
 * RMH tracker counts rest on contributors; fewer than K_FLOOR (or unknown) is suppressed. Other sources show as published.
 *
 * Q2 (phase 4): the rows are already the PUBLISHED figures (`publicCell`: the once-a-day snapshot, never the live
 * count), so `contributors` here is `publishedContributors`. RMH cells dated TODAY (UTC) or later are held back too,
 * whatever their count. The snapshot is what stops a back-dated milestone moving a past cell in real time; the date
 * hold-back covers a cell that is itself still filling. `today` defaults to the clock (fail closed); pass the
 * request's own `now` so a body is a function of its inputs.
 */
export function applyKFloor(rows: readonly CountCell[], today: string = utcDayOf(new Date())): CountCell[] {
  return rows.filter(
    (r) => !(r.source === 'RMH' && (r.contributors === null || r.contributors < K_FLOOR || r.date >= today)),
  );
}

/** The in-state split is shown only when both halves clear the floor, independent of the total. */
export function floorSplit(
  inState: number | null,
  outOfState: number | null,
): { inState: number; outOfState: number } | null {
  if (inState === null || outOfState === null) return null;
  if (inState < K_FLOOR || outOfState < K_FLOOR) return null;
  return { inState, outOfState };
}

export function buildTypeSeries(rows: readonly CountCell[], today?: string): TypeSeries {
  const visible = applyKFloor(rows, today); // floor first: a suppressed source can never be primary
  const bySource = new Map<MedSource, CountCell[]>();
  for (const r of visible) {
    const list = bySource.get(r.source);
    if (list) list.push(r);
    else bySource.set(r.source, [r]);
  }
  const sources = PRIMARY_ORDER.flatMap((source) => {
    const list = bySource.get(source);
    if (!list) return [];
    const days = list.map(({ date, count }) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    return [{ source, days, total: days.reduce((n, d) => n + d.count, 0) }];
  });
  return { primary: pickPrimary(sources.map((s) => s.source)), sources };
}

/** Latest cycle with data, never later than the June 1 rollover; an explicit request wins. */
export function resolveCycleYear(a: { requested?: number; latestWithData: number | null; now: Date }): number {
  if (a.requested !== undefined) return a.requested;
  const rollover = cycleYearOf(a.now, 'SECONDARY');
  return a.latestWithData === null ? rollover : Math.min(a.latestWithData, rollover);
}

export function toCumulativeByDay(
  days: { date: string; count: number }[],
  dayZeroOn: string,
): { day: number; cumulative: number }[] {
  let cumulative = 0;
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      cumulative += d.count;
      return { day: dayOfCycle(d.date, dayZeroOn), cumulative };
    });
}

/** `cycles` newest first. One source only, so overlay lines are never cross-source. */
export function overlaySource(cycles: { cycleYear: number; sources: MedSource[] }[]): MedSource | null {
  const newest = cycles[0];
  if (!newest) return null;
  const earlier = new Set(cycles.slice(1).flatMap((c) => c.sources));
  const inNewest = new Set(newest.sources);
  return (
    PRIMARY_ORDER.find((s) => inNewest.has(s) && earlier.has(s)) ?? PRIMARY_ORDER.find((s) => inNewest.has(s)) ?? null
  );
}

export function filterSchools<T extends { name: string; shortName: string; state: string; degree: string }>(
  schools: readonly T[],
  f: { q?: string; degree?: string; state?: string },
): T[] {
  const q = f.q?.trim().toLowerCase();
  const state = f.state?.toUpperCase();
  return schools.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q) || s.shortName.toLowerCase().includes(q)) &&
      (!f.degree || s.degree === f.degree) &&
      (!state || s.state.toUpperCase() === state),
  );
}

export function encodeLiveCursor(c: { occurredAt: Date; id: string }): string {
  return btoa(`${c.occurredAt.getTime()}.${c.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLiveCursor(s: string): { occurredAt: Date; id: string } | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  let raw: string;
  try {
    raw = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m) return null;
  const occurredAt = new Date(Number(m[1]));
  if (Number.isNaN(occurredAt.getTime())) return null;
  return { occurredAt, id: m[2]! };
}

/**
 * New rows go in front; the first batch is a baseline, so nothing "arrives" from empty.
 * `gap` is true when the fetched head shares no row with a non-empty `prev`: more events than one page arrived between
 * refetches, so merging would leave a hole before the old head. The result is then the fresh head alone and the caller
 * drops its older pages (and resets "Show older" to the head's own next cursor).
 */
export function mergeLiveHead<T extends { id: string }>(
  prev: readonly T[],
  head: readonly T[],
): { rows: T[]; arrived: string[]; gap: boolean } {
  if (prev.length === 0) return { rows: [...head], arrived: [], gap: false };
  const known = new Set(prev.map((r) => r.id));
  const fresh = head.filter((r) => !known.has(r.id));
  if (head.length > 0 && fresh.length === head.length) {
    return { rows: [...head], arrived: fresh.map((r) => r.id), gap: true };
  }
  return { rows: [...fresh, ...prev], arrived: fresh.map((r) => r.id), gap: false };
}

export function truncateToMinute(d: Date): string {
  const t = new Date(d.getTime());
  t.setUTCSeconds(0, 0);
  return t.toISOString();
}

/** A YYYY-MM-DD is a UTC calendar day; formatting it in the viewer's zone would shift it. */
export function formatUtcDay(
  day: string,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}
