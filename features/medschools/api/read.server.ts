import { prisma } from '@/lib/prisma.server';
import {
  CHARTED_TYPES,
  K_FLOOR,
  applyKFloor,
  buildTypeSeries,
  publicCell,
  decodeLiveCursor,
  encodeLiveCursor,
  filterSchools,
  schoolMatches,
  floorSplit,
  pickPrimary,
  resolveCycleYear,
  toCumulativeByDay,
  truncateToMinute,
  utcDayOf,
  type CountCell,
} from '../engine/public-read';
import { floorWhere, publicSum } from '../engine/floor';
import { slugsOf } from '../engine/mine';
import { ARRIVAL_CYCLE_MIN, ARRIVAL_ZONE, enoughArrivals, shapeArrivals } from '../engine/arrivals';
import { cycleEndOn, cycleYearOf, defaultDayZero } from '../engine/cycle';
import { addDays } from '../engine/stats/days';
import { detectWaves } from '../engine/stats/waves';
import { primarySeriesOf, seriesOfSource, toDayCounts } from '../engine/stats/input';
import {
  isAllPrograms,
  legacyOf,
  parsePrograms,
  programPair,
  programsFromLegacy,
  programsMatch,
  type ProgramKey,
} from '../engine/programs';
import type { MedEventType, MedProgram, MedSource } from '../engine/types';
import type {
  ActivityTypeDto,
  HistoryCycleDto,
  ListMedSchoolsRes,
  MedChartedTypeId,
  MedDegreeId,
  MedArrivalsRes,
  MedLiveRes,
  MedSourceId,
  MedProgramFilter,
  MedSchoolActivityRes,
  MedSchoolDetailDto,
  MedSchoolForecastRes,
  MedSchoolHistoryRes,
  MedTodayRes,
  WaveDto,
} from '../medschools.contract';
import type {
  ActivityQuery,
  ArrivalsQuery,
  ForecastQuery,
  HistoryQuery,
  ListSchoolsQuery,
  LiveQuery,
  TodayQuery,
} from './read-schemas';
import { buildSourceLinks } from './source-links';

/**
 * Anonymous read loaders for the public pages (spec §6, §10). Every Prisma read has an explicit `select`
 * (or is a count / groupBy): `inState`, `dedupeHash`, `ingestedAt` and `cursorPostHash` are never selected.
 * None of these reads a session, so a body is identical for every viewer (it is cached publicly).
 */

const CHARTED = CHARTED_TYPES as readonly MedChartedTypeId[];
const OTHER_TOTAL_TYPES = ['WITHDRAWN', 'HOLD'] as const;
const day = (d: Date): string => d.toISOString().slice(0, 10);

/** O5: ALL reads both programs; null-program events are never in a count row (the column is not nullable). */
const programsOf = (p: MedProgramFilter | undefined): MedProgram[] =>
  p === 'REG' ? ['REG'] : p === 'PHD' ? ['PHD'] : ['REG', 'PHD'];

interface RawCell extends CountCell {
  eventType: MedEventType;
}

/**
 * Floor each row, then sum rows of the same (source, date, eventType): that is REG + PHD within one source.
 * Never sums across sources. `contributors` of a summed RMH cell is the sum of the kept rows' contributors.
 */
function sumPrograms(rows: readonly RawCell[], today: string): RawCell[] {
  const out = new Map<string, RawCell>();
  for (const r of applyKFloor(rows, today) as RawCell[]) {
    const key = `${r.source}|${r.date}|${r.eventType}`;
    const prev = out.get(key);
    if (!prev) out.set(key, { ...r });
    else {
      prev.count += r.count;
      prev.contributors =
        prev.contributors === null || r.contributors === null ? null : prev.contributors + r.contributors;
    }
  }
  return [...out.values()];
}

/** Same shape the search parser accepts; anything else (`%00`, upper case, over-long) is a 404 and never reaches Postgres. */
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;

async function findSchool(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  return prisma.medSchool.findFirst({
    where: { slug, active: true },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      degree: true,
      city: true,
      state: true,
      website: true,
      interviewFormat: true,
      interviewType: true,
    },
  });
}

async function latestCycleWith(
  where: { schoolId?: string; eventType?: MedEventType },
  now: Date,
): Promise<number | null> {
  // Floored too: a suppressed RMH row must not move the cycle the pages show.
  const r = await prisma.medCycleCount.findFirst({
    where: { ...where, ...floorWhere(now) },
    orderBy: { cycleYear: 'desc' },
    select: { cycleYear: true },
  });
  return r?.cycleYear ?? null;
}

/**
 * The one cycle the site shows, resolved the same way for the index, today, and every per-school read: the newest
 * cycle with a floored INTERVIEW row anywhere, capped at the June 1 rollover, unless the caller asked for one. A school
 * is never given its own newest cycle: with nothing this cycle it shows the empty state, not last cycle's figures.
 */
async function siteCycle(now: Date, requested?: number): Promise<number> {
  return resolveCycleYear({
    ...(requested !== undefined ? { requested } : {}),
    latestWithData: await latestCycleWith({ eventType: 'INTERVIEW' }, now),
    now,
  });
}

/**
 * The program set a list or live query names: `programs`, else the older `degree` and `program` mapped onto it, else
 * every program. Pure; the one place the readers turn query parameters into a set.
 */
const setOf = (q: { programs?: string | undefined; degree?: MedDegreeId | undefined; program?: string | undefined }) =>
  (q.programs ? parsePrograms(q.programs) : undefined) ??
  programsFromLegacy(q.degree, q.program === 'REG' || q.program === 'PHD' ? q.program : 'ALL');

/** `CA,NY` -> the codes, deduped and sorted (the schema has checked each one). */
const statesOf = (v: string | undefined): string[] | undefined => (v ? [...new Set(v.split(','))].sort() : undefined);

/** The site's current cycle as the readers resolve it; the Q&A retrieval clamps a question's cycle against it. */
export const siteCycleYear = siteCycle;

export async function listSchools(q: ListSchoolsQuery, now: Date = new Date()): Promise<ListMedSchoolsRes> {
  const set: ProgramKey[] = setOf(q);
  const program = legacyOf(set).programFilter;
  const [all, cycleYear] = await Promise.all([
    prisma.medSchool.findMany({
      where: { active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        shortName: true,
        degree: true,
        city: true,
        state: true,
        // The names the sources know a school by ("Keck School of Medicine of the University of Southern California"):
        // search only, never in the response.
        aliases: { select: { sourceKey: true } },
      },
      orderBy: { name: 'asc' },
    }),
    siteCycle(now),
  ]);
  const degreeOf = new Map(all.map((s) => [s.id, s.degree] as const));
  const sums = await prisma.medCycleCount.groupBy({
    by: ['schoolId', 'source', 'program'],
    where: {
      cycleYear,
      eventType: 'INTERVIEW',
      program: { in: [...new Set(set.map((k) => programPair(k).program))] },
      ...floorWhere(now),
    },
    _sum: { count: true, publishedCount: true },
  });
  // A school counts only the programs of its own degree that are in the set (an MD school never adds DO's).
  const bySchool = new Map<string, Map<MedSource, number>>();
  for (const s of sums) {
    const degree = degreeOf.get(s.schoolId);
    if (!degree || !programsMatch(set, degree, s.program)) continue;
    const list = bySchool.get(s.schoolId) ?? new Map<MedSource, number>();
    list.set(s.source, (list.get(s.source) ?? 0) + publicSum(s.source, s._sum));
    bySchool.set(s.schoolId, list);
  }
  const degrees = new Set(set.map((k) => programPair(k).degree));
  const searchable = all.map((s) => ({ ...s, terms: (s.aliases ?? []).map((a) => a.sourceKey) }));
  const filtered = filterSchools(searchable, { q: q.q, states: statesOf(q.state) }).filter((s) =>
    degrees.has(s.degree),
  );
  const latest = await latestPublicEvents(cycleYear, set);
  return {
    cycleYear,
    program,
    states: [...new Set(all.map((s) => s.state))].sort(),
    schools: filtered.map((s) => {
      const list = bySchool.get(s.id) ?? new Map<MedSource, number>();
      const primary = pickPrimary(list.keys());
      return {
        slug: s.slug,
        name: s.name,
        shortName: s.shortName,
        degree: s.degree,
        city: s.city,
        state: s.state,
        reported: primary ? { source: primary, count: list.get(primary) ?? 0 } : null,
        latest: latest.get(s.id) ?? null,
      };
    }),
  };
}

/**
 * Each active school's newest public event of the cycle (owner 2026-11-24: the index shows it at the end of the row).
 * Exactly the events the live feed shows: Admit and SDN only (an RMH event is never public one by one, D5; it reaches
 * the public only as floored daily counts), active schools, the same program set (every program on also takes events
 * with no program). One `DISTINCT ON` over the cycle's rows. Nothing about the viewer is read, so the response stays
 * user-independent and cacheable. `dayOnly`: an event stored at exactly 00:00 UTC carries a calendar day, not a time
 * (the arrivals rule), so the page prints the day instead of a time ago.
 */
async function latestPublicEvents(
  cycleYear: number,
  set: ProgramKey[],
): Promise<Map<string, { eventType: MedEventType; occurredAt: string; dayOnly: boolean }>> {
  const all = isAllPrograms(set);
  const pairs = all ? [''] : set.map((k) => `${programPair(k).program}:${programPair(k).degree}`);
  const rows = await prisma.$queryRaw<{ schoolId: string; eventType: MedEventType; occurredAt: Date }[]>`
    SELECT DISTINCT ON (e."schoolId") e."schoolId" AS "schoolId", e."eventType" AS "eventType", e."occurredAt" AS "occurredAt"
    FROM "med_cycle_event" e
    JOIN "med_school" s ON s."id" = e."schoolId"
    WHERE e."cycleYear" = ${cycleYear}
      AND e."source" IN ('ADMIT'::"MedSource", 'SDN'::"MedSource")
      AND s."active" = true
      AND (${all} OR (e."program"::text || ':' || s."degree"::text) = ANY(${pairs}::text[]))
    ORDER BY e."schoolId", e."occurredAt" DESC, e."id" DESC`;
  return new Map(
    rows.map((r) => [
      r.schoolId,
      {
        eventType: r.eventType,
        occurredAt: truncateToMinute(r.occurredAt),
        dayOnly: r.occurredAt.toISOString().slice(10) === 'T00:00:00.000Z',
      },
    ]),
  );
}

/** What the link-preview card draws (Task 8): the school and one floored figure, never a program-less or suppressed one. */
export interface MedSchoolCardData {
  name: string;
  degree: MedDegreeId;
  city: string;
  state: string;
  cycleYear: number;
  reported: { source: MedSourceId; count: number } | null;
}

/** Null for an unknown or inactive slug. The count is the primary source's interview total, REG + PHD, after the floor. */
export async function getCardData(slug: string, now: Date = new Date()): Promise<MedSchoolCardData | null> {
  const school = await findSchool(slug);
  if (!school) return null;
  const cycleYear = await siteCycle(now);
  const sums = await prisma.medCycleCount.groupBy({
    by: ['source'],
    where: {
      schoolId: school.id,
      cycleYear,
      eventType: 'INTERVIEW',
      program: { in: programsOf('ALL') },
      ...floorWhere(now),
    },
    _sum: { count: true, publishedCount: true },
  });
  const primary = pickPrimary(sums.map((x) => x.source));
  const hit = sums.find((x) => x.source === primary);
  return {
    name: school.name,
    degree: school.degree,
    city: school.city,
    state: school.state,
    cycleYear,
    reported: hit ? { source: hit.source, count: publicSum(hit.source, hit._sum) } : null,
  };
}

export async function getSchool(slug: string, now: Date = new Date()): Promise<MedSchoolDetailDto | null> {
  const school = await findSchool(slug);
  if (!school) return null;
  const cycleYear = await siteCycle(now);
  const [aliases, threads, stats, profiles, questions, programRows] = await Promise.all([
    prisma.medSchoolAlias.findMany({ where: { schoolId: school.id }, select: { source: true, sourceKey: true } }),
    prisma.medSdnThread.findMany({
      where: { schoolId: school.id },
      select: { threadId: true, slug: true, cycleYear: true, archive: true },
    }),
    prisma.medSchoolStats.findMany({
      // ADMIT stats are written under the interview-season cycle and labelled "all reported cycles": read them
      // whatever cycle they carry and keep the newest per (program, residence) below.
      where: { schoolId: school.id, OR: [{ cycleYear }, { source: 'ADMIT' }] },
      orderBy: { cycleYear: 'desc' },
      select: {
        source: true,
        program: true,
        cycleYear: true,
        residence: true,
        contributors: true,
        gpaMedian: true,
        gpaLow: true,
        gpaHigh: true,
        mcatMedian: true,
        mcatLow: true,
        mcatHigh: true,
        interviewToAcceptancePct: true,
        applicationToInterviewPct: true,
        applicationCount: true,
        interviewCount: true,
        admittedCount: true,
        researchHours: true,
        clinicalHours: true,
        nonClinicalHours: true,
      },
    }),
    prisma.medInterviewProfile.findMany({
      where: { schoolId: school.id },
      select: {
        source: true,
        format: true,
        fileType: true,
        avgDifficulty: true,
        avgStress: true,
        avgImpression: true,
        interviewCount: true,
        interviewStyle: true,
        interviewLength: true,
        inStateCount: true,
        outOfStateCount: true,
        feedbackPositive: true,
        feedbackNegative: true,
        feedbackBefore: true,
      },
    }),
    prisma.medInterviewQuestion.findMany({
      where: { schoolId: school.id },
      select: { text: true, source: true, votes: true, cycleYear: true },
      orderBy: [{ votes: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 100,
    }),
    prisma.medCycleCount.findMany({
      where: { schoolId: school.id, cycleYear, ...floorWhere(now) },
      select: { program: true },
      distinct: ['program'],
    }),
  ]);
  // D5: an in/out-of-state row (and any RMH row) stands only on at least K_FLOOR contributors; null fails closed.
  const seenAdmit = new Set<string>();
  const shownStats = stats.filter((s) => {
    if (s.source === 'ADMIT') {
      const key = `${s.program}|${s.residence}`;
      if (seenAdmit.has(key)) return false;
      seenAdmit.add(key);
    } else if (s.cycleYear !== cycleYear) return false;
    const guarded = s.residence !== 'GLOBAL' || s.source === 'RMH';
    return !guarded || (s.contributors !== null && s.contributors >= K_FLOOR);
  });
  return {
    school: {
      slug: school.slug,
      name: school.name,
      shortName: school.shortName,
      degree: school.degree,
      city: school.city,
      state: school.state,
      website: school.website,
      interviewFormat: school.interviewFormat,
      interviewType: school.interviewType,
    },
    cycleYear,
    programsWithData: programRows.map((r) => r.program),
    links: buildSourceLinks({ aliases, threads, currentCycle: cycleYear }),
    stats: shownStats.map(({ contributors: _c, ...s }) => ({ ...s, allCycles: s.source === 'ADMIT' })),
    profiles: profiles.map(
      ({ inStateCount, outOfStateCount, feedbackPositive, feedbackNegative, feedbackBefore, ...p }) => ({
        ...p,
        split: floorSplit(inStateCount, outOfStateCount),
        feedbackPositive: feedbackPositive.slice(0, 10),
        feedbackNegative: feedbackNegative.slice(0, 10),
        feedbackBefore: feedbackBefore.slice(0, 10),
      }),
    ),
    questions: questions.slice(0, 100),
  };
}

/**
 * Null-program events of the charted types, for ONE source: the first of ADMIT, SDN with any in the cycle. Sources
 * are never added together; RMH events are not public one by one.
 */
async function unreportedFor(
  schoolId: string,
  cycleYear: number,
): Promise<{ count: number; source: 'ADMIT' | 'SDN' | null }> {
  for (const source of ['ADMIT', 'SDN'] as const) {
    const count = await prisma.medCycleEvent.count({
      where: { schoolId, cycleYear, program: null, source, eventType: { in: [...CHARTED_TYPES] } },
    });
    if (count > 0) return { count, source };
  }
  return { count: 0, source: null };
}

/**
 * Waves (D10) on the INTERVIEW primary series that is already floored and summed (REG + PHD within the source). No new
 * read: the response's own series. Dates are calendar days, today's partial count included.
 */
function wavesOf(interview: ActivityTypeDto | undefined, dayZeroOn: string): WaveDto[] {
  const primary = interview?.sources.find((s) => s.source === interview.primary);
  if (!primary) return [];
  return detectWaves(toDayCounts(primary.days, dayZeroOn)).map((w) => ({
    date: addDays(dayZeroOn, w.day),
    count: w.count,
    baseline: w.baseline,
  }));
}

/** The INTERVIEW series of already floored and summed cells, in the Activity response's shape (waves read only this). */
function interviewOf(cells: readonly RawCell[], today: string): ActivityTypeDto {
  const s = buildTypeSeries(
    cells.filter((c) => c.eventType === 'INTERVIEW'),
    today,
  );
  return { eventType: 'INTERVIEW', primary: s.primary, sources: s.sources };
}

export async function getActivity(
  slug: string,
  q: ActivityQuery,
  now: Date = new Date(),
): Promise<MedSchoolActivityRes | null> {
  const school = await findSchool(slug);
  if (!school) return null;
  const program = q.program ?? 'ALL';
  const cycleYear = await siteCycle(now, q.cycle);
  const [rows, cycle, unreported] = await Promise.all([
    prisma.medCycleCount.findMany({
      where: {
        schoolId: school.id,
        cycleYear,
        // Both programs always: the waves follow REG + PHD (D10) whatever program the page shows, as the live feed's do.
        program: { in: programsOf('ALL') },
        eventType: { in: [...CHARTED_TYPES, ...OTHER_TOTAL_TYPES] },
      },
      select: {
        source: true,
        date: true,
        program: true,
        eventType: true,
        count: true,
        contributors: true,
        publishedCount: true,
        publishedContributors: true,
      },
    }),
    prisma.medCycle.findUnique({ where: { cycleYear }, select: { dayZeroOn: true, dateEstimated: true } }),
    unreportedFor(school.id, cycleYear),
  ]);
  const today = utcDayOf(now);
  const cellsOf = (shown: readonly MedProgram[]) =>
    sumPrograms(
      rows
        .filter((r) => shown.length === 2 || shown.includes(r.program))
        .flatMap((r) => publicCell({ ...r, date: day(r.date) }) ?? []),
      today,
    );
  const cells = cellsOf(programsOf(program));
  // Withdrawn and hold are totals only, never charted: floored and summed per source like the rest.
  const otherTotals = OTHER_TOTAL_TYPES.map((eventType) => {
    const bySource = new Map<MedSource, number>();
    for (const c of cells) {
      if (c.eventType === eventType) bySource.set(c.source, (bySource.get(c.source) ?? 0) + c.count);
    }
    return {
      eventType,
      sources: [...bySource].map(([source, total]) => ({ source, total })),
    };
  }).filter((o) => o.sources.length > 0);
  const types: ActivityTypeDto[] = CHARTED.map((eventType) => {
    const s = buildTypeSeries(
      cells.filter((c) => c.eventType === eventType),
      utcDayOf(now),
    );
    return { eventType, primary: s.primary, sources: s.sources };
  });
  const dayZeroOn = cycle ? day(cycle.dayZeroOn) : defaultDayZero(cycleYear);
  return {
    cycleYear,
    program,
    dayZeroOn,
    dayZeroEstimated: cycle ? cycle.dateEstimated : true,
    types,
    otherTotals,
    unreportedProgram: unreported.count,
    unreportedProgramSource: unreported.source,
    waves: wavesOf(program === 'ALL' ? types[0] : interviewOf(cellsOf(programsOf('ALL')), today), dayZeroOn),
  };
}

export async function getHistory(
  slug: string,
  q: HistoryQuery,
  now: Date = new Date(),
): Promise<MedSchoolHistoryRes | null> {
  const school = await findSchool(slug);
  if (!school) return null;
  const program = q.program ?? 'ALL';
  const eventType: MedChartedTypeId = q.type ?? 'INTERVIEW';
  const base = { schoolId: school.id, program: { in: programsOf(program) }, eventType, ...floorWhere(now) };
  const years = await prisma.medCycleCount.findMany({
    where: base,
    select: { cycleYear: true },
    distinct: ['cycleYear'],
    orderBy: { cycleYear: 'desc' },
    take: 4,
  });
  const cycleYears = years.map((y) => y.cycleYear);
  const [rows, cycles] = await Promise.all([
    prisma.medCycleCount.findMany({
      where: { ...base, cycleYear: { in: cycleYears } },
      select: {
        cycleYear: true,
        source: true,
        date: true,
        eventType: true,
        count: true,
        contributors: true,
        publishedCount: true,
        publishedContributors: true,
      },
    }),
    prisma.medCycle.findMany({
      where: { cycleYear: { in: cycleYears } },
      select: { cycleYear: true, dayZeroOn: true, dateEstimated: true },
    }),
  ]);
  const out: HistoryCycleDto[] = [];
  for (const cycleYear of [...cycleYears].sort((a, b) => b - a)) {
    const cy = cycles.find((c) => c.cycleYear === cycleYear);
    const dayZeroOn = cy ? day(cy.dayZeroOn) : defaultDayZero(cycleYear);
    const cells = sumPrograms(
      rows.filter((r) => r.cycleYear === cycleYear).flatMap((r) => publicCell({ ...r, date: day(r.date) }) ?? []),
      utcDayOf(now),
    );
    const series = buildTypeSeries(cells, utcDayOf(now));
    if (series.sources.length === 0) continue;
    out.push({
      cycleYear,
      dayZeroOn,
      dayZeroEstimated: cy ? cy.dateEstimated : true,
      sources: series.sources.map((s) => ({
        source: s.source,
        points: toCumulativeByDay(s.days, dayZeroOn),
        total: s.total,
      })),
    });
  }
  return { program, eventType, cycles: out };
}

/** The stored band as parallel arrays; anything malformed reads as no band (the row is the job's, but fail soft). */
function bandOf(curve: unknown): MedSchoolForecastRes['band'] {
  const c = curve as { days?: unknown; p10?: unknown; p50?: unknown; p90?: unknown } | null;
  if (!c || !Array.isArray(c.days) || !Array.isArray(c.p10) || !Array.isArray(c.p50) || !Array.isArray(c.p90))
    return [];
  const out: MedSchoolForecastRes['band'] = [];
  for (let i = 0; i < c.days.length; i++) {
    const day = c.days[i];
    const p10 = c.p10[i];
    const p50 = c.p50[i];
    const p90 = c.p90[i];
    if (typeof day === 'number' && typeof p10 === 'number' && typeof p50 === 'number' && typeof p90 === 'number') {
      out.push({ day, p10, p50, p90 });
    }
  }
  return out;
}

interface StoredSummary {
  dayZeroOn: string;
  total: { p10: number; p50: number; p90: number } | null;
  halfDay: { p10: number; p50: number; p90: number } | null;
  basis: { cycleYear: number; source: MedSourceId; weight: number }[];
}

/**
 * The forecast of one program (ALL reads REG, D12) and event type for the SITE's cycle. A function of the stored
 * `MedForecast` row plus the floored observed series (the same floor and primary rule as the Activity chart), cumulated
 * through the row's `asOf`: today's partial counts never show. No row but floored data is `pending`; no data `no-data`.
 */
export async function getForecast(
  slug: string,
  q: ForecastQuery,
  now: Date = new Date(),
): Promise<MedSchoolForecastRes | null> {
  const school = await findSchool(slug);
  if (!school) return null;
  const program: 'REG' | 'PHD' = q.program === 'PHD' ? 'PHD' : 'REG';
  const eventType: MedChartedTypeId = q.type ?? 'INTERVIEW';
  const cycleYear = await siteCycle(now);
  const today = utcDayOf(now);
  const [row, cycle, counts] = await Promise.all([
    prisma.medForecast.findFirst({
      where: { schoolId: school.id, program, cycleYear, eventType },
      select: { mode: true, source: true, asOf: true, curve: true, summary: true },
    }),
    prisma.medCycle.findUnique({ where: { cycleYear }, select: { dayZeroOn: true, dateEstimated: true } }),
    prisma.medCycleCount.findMany({
      where: { schoolId: school.id, cycleYear, program, eventType, ...floorWhere(now) },
      select: {
        source: true,
        date: true,
        count: true,
        contributors: true,
        publishedCount: true,
        publishedContributors: true,
      },
    }),
  ]);
  const stored = row ? (row.summary as StoredSummary | null) : null;
  const cycleDayZero = cycle ? day(cycle.dayZeroOn) : defaultDayZero(cycleYear);
  // The days of a stored band count from the day zero the job used, so that one names the dates.
  const dayZeroOn = stored?.dayZeroOn ?? cycleDayZero;
  const cells = counts.map((r) => ({ ...r, date: day(r.date), eventType }));
  const asOf = row ? day(row.asOf) : addDays(today, -1);
  const series = row?.source
    ? { source: row.source as MedSource, days: seriesOfSource(cells, today, row.source as MedSource) }
    : primarySeriesOf(cells, today);
  const observed = toCumulativeByDay(
    (series?.days ?? []).filter((d) => d.date <= asOf),
    dayZeroOn,
  );
  const base = {
    program,
    eventType,
    cycleYear,
    dayZeroOn,
    dayZeroEstimated: cycle ? cycle.dateEstimated : true,
    endOn: cycleEndOn(cycleYear, eventType),
  };
  if (!row) {
    return {
      ...base,
      status: observed.length > 0 ? 'pending' : 'no-data',
      source: series?.source ?? null,
      asOf: null,
      observed,
      band: [],
      summary: null,
      basis: [],
    };
  }
  // The band starts at the count the job saw at `asOf`. A source that revised past days since (an Admit re-roll-up) moves
  // the live observed line, and a line ending at one value with a band starting at another reads as a jump: shift the
  // band, and the total with it, by the difference, and never below what is already observed.
  const stored0 = row.mode === 'NONE' ? [] : bandOf(row.curve);
  const bandFrom = stored0[0];
  const seen = bandFrom ? (observed.filter((o) => o.day <= bandFrom.day).at(-1)?.cumulative ?? 0) : 0;
  const shift = bandFrom ? seen - bandFrom.p50 : 0;
  const lift = (v: number): number => Math.max(seen, v + shift);
  const band =
    shift === 0 ? stored0 : stored0.map((b) => ({ day: b.day, p10: lift(b.p10), p50: lift(b.p50), p90: lift(b.p90) }));
  const dateOf = (n: number): string => addDays(dayZeroOn, n);
  return {
    ...base,
    status: row.mode === 'FULL' ? 'ready' : row.mode === 'EARLY' ? 'early' : 'no-history',
    source: (row.source as MedSourceId | null) ?? series?.source ?? null,
    asOf,
    observed,
    band,
    summary:
      row.mode !== 'NONE' && stored?.total && stored.halfDay
        ? {
            total:
              shift === 0
                ? stored.total
                : { p10: lift(stored.total.p10), p50: lift(stored.total.p50), p90: lift(stored.total.p90) },
            halfOn: {
              p10: dateOf(stored.halfDay.p10),
              p50: dateOf(stored.halfDay.p50),
              p90: dateOf(stored.halfDay.p90),
            },
          }
        : null,
    basis: row.mode === 'NONE' ? [] : (stored?.basis ?? []),
  };
}

/**
 * When results arrive: ADMIT and SDN events of one category with an exact time, aggregated in Postgres into a weekday
 * count, an hour count (both US Eastern) and, per cycle, the Eastern day of the first and of the median report. An SDN
 * or ADMIT event stored at exactly 00:00:00.000 UTC is day-only (a date stated in a post, or an Admit profile-history date) and is left out. No individual
 * timestamp is selected into the app: the query returns groups and aggregates, and a cycle needs ARRIVAL_CYCLE_MIN
 * events to show. Under ARRIVALS_MIN events the arrays are empty.
 */
export async function getArrivals(slug: string, q: ArrivalsQuery): Promise<MedArrivalsRes | null> {
  const school = await findSchool(slug);
  if (!school) return null;
  const program = q.program ?? 'ALL';
  const eventType: MedChartedTypeId = q.type ?? 'INTERVIEW';
  const programs = programsOf(program);
  const [groups, perCycle] = await Promise.all([
    prisma.$queryRaw<{ dow: number; hr: number; n: number }[]>`
      SELECT EXTRACT(ISODOW FROM ("occurredAt" AT TIME ZONE ${ARRIVAL_ZONE}))::int AS dow,
             EXTRACT(HOUR FROM ("occurredAt" AT TIME ZONE ${ARRIVAL_ZONE}))::int AS hr,
             COUNT(*)::int AS n
      FROM "med_cycle_event"
      WHERE "schoolId" = ${school.id}
        AND "eventType" = ${eventType}::"MedEventType"
        AND "source" IN ('ADMIT'::"MedSource", 'SDN'::"MedSource")
        AND ("program" IS NULL AND ${program === 'ALL'} OR "program" = ANY(${programs}::"MedProgram"[]))
        AND NOT ("source" IN ('ADMIT'::"MedSource", 'SDN'::"MedSource") AND ("occurredAt" AT TIME ZONE 'UTC')::time = TIME '00:00:00')
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ cycleYear: number; n: number; firstOn: string; medianOn: string }[]>`
      SELECT "cycleYear" AS "cycleYear",
             COUNT(*)::int AS n,
             TO_CHAR(MIN("occurredAt" AT TIME ZONE ${ARRIVAL_ZONE}), 'YYYY-MM-DD') AS "firstOn",
             TO_CHAR((percentile_disc(0.5) WITHIN GROUP (ORDER BY "occurredAt")) AT TIME ZONE ${ARRIVAL_ZONE}, 'YYYY-MM-DD') AS "medianOn"
      FROM "med_cycle_event"
      WHERE "schoolId" = ${school.id}
        AND "eventType" = ${eventType}::"MedEventType"
        AND "source" IN ('ADMIT'::"MedSource", 'SDN'::"MedSource")
        AND ("program" IS NULL AND ${program === 'ALL'} OR "program" = ANY(${programs}::"MedProgram"[]))
        AND NOT ("source" IN ('ADMIT'::"MedSource", 'SDN'::"MedSource") AND ("occurredAt" AT TIME ZONE 'UTC')::time = TIME '00:00:00')
      GROUP BY "cycleYear"
      HAVING COUNT(*) >= ${ARRIVAL_CYCLE_MIN}
      ORDER BY "cycleYear" DESC
      LIMIT 6`,
  ]);
  const shape = shapeArrivals(groups);
  if (!enoughArrivals(shape.total)) {
    return { program, eventType, zone: ARRIVAL_ZONE, total: shape.total, weekdays: [], hours: [], cycles: [] };
  }
  return {
    program,
    eventType,
    zone: ARRIVAL_ZONE,
    total: shape.total,
    weekdays: shape.weekdays,
    hours: shape.hours,
    cycles: perCycle.map((c) => ({ cycleYear: c.cycleYear, count: c.n, firstOn: c.firstOn, medianOn: c.medianOn })),
  };
}

/**
 * Which UTC days each school of this page had a wave of invites (D10), keyed by slug. One batched read for the whole
 * page: the INTERVIEW count rows of the page's schools for the cycle(s) of the page's invite days, from the cycle's first
 * report, through the same floor and primary-source rule as the Activity chart (REG + PHD summed, the primary chosen over
 * the whole cycle). Reading only a window around the page would take the first row of the window for the school's first
 * report and miss a burst that follows a quiet spell. A page with no INTERVIEW row reads nothing.
 */
async function liveWaveDays(
  page: readonly { eventType: MedEventType; occurredAt: Date; school: { slug: string } }[],
  now: Date,
): Promise<Map<string, Set<string>>> {
  const invites = page.filter((r) => r.eventType === 'INTERVIEW');
  if (invites.length === 0) return new Map();
  const cycleYears = [...new Set(invites.map((r) => cycleYearOf(r.occurredAt, 'INTERVIEW')))];
  const slugs = [...new Set(invites.map((r) => r.school.slug))];
  const waves = await schoolWaves(slugs, cycleYears, now);
  return new Map([...waves].map(([slug, days]) => [slug, new Set(days.keys())]));
}

/**
 * Each school's wave days (D10) in the given cycles, keyed by slug, then by UTC day, with that day's count on the
 * primary series. One batched read of the schools' INTERVIEW count rows for those cycles, from each cycle's first
 * report, through the floor and the primary-source rule of the Activity chart (REG + PHD summed). The live feed's row
 * flag and the live summary's "Waves now" both read it, so they cannot disagree.
 */
export async function schoolWaves(
  slugs: readonly string[],
  cycleYears: readonly number[],
  now: Date,
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (slugs.length === 0 || cycleYears.length === 0) return out;
  const rows = await prisma.medCycleCount.findMany({
    where: {
      eventType: 'INTERVIEW',
      cycleYear: { in: [...cycleYears] },
      school: { slug: { in: [...slugs] }, active: true },
      ...floorWhere(now),
    },
    select: {
      source: true,
      date: true,
      eventType: true,
      cycleYear: true,
      count: true,
      contributors: true,
      publishedCount: true,
      publishedContributors: true,
      school: { select: { slug: true } },
    },
  });
  for (const slug of slugs) {
    const found = new Map<string, number>();
    for (const cycleYear of cycleYears) {
      const cells = sumPrograms(
        rows
          .filter((r) => r.school.slug === slug && r.cycleYear === cycleYear)
          .flatMap((r) => publicCell({ ...r, date: day(r.date) }) ?? []),
        utcDayOf(now),
      );
      const series = buildTypeSeries(cells, utcDayOf(now));
      const primary = series.sources.find((s) => s.source === series.primary);
      const base = primary?.days[0]?.date;
      if (!primary || !base) continue;
      for (const w of detectWaves(toDayCounts(primary.days, base))) found.set(addDays(base, w.day), w.count);
    }
    out.set(slug, found);
  }
  return out;
}

/**
 * The live feed's program filter for a program set: (degree, program) pairs; every program on (or no set) is no
 * filter, and includes the events that did not report a program. Shared with the live summary.
 */
export function liveProgramWhere(set: readonly ProgramKey[] | undefined) {
  return set && !isAllPrograms(set)
    ? [
        {
          OR: set.map((k) => {
            const p = programPair(k);
            return { program: p.program, school: { degree: p.degree } };
          }),
        },
      ]
    : [];
}

/** `CA,NY` -> the codes, deduped and sorted; for the live summary. */
export const liveStatesOf = statesOf;

/** The active schools a search names (`schoolMatches` over each school's names and source aliases). */
async function schoolIdsMatching(text: string): Promise<string[]> {
  const rows = await prisma.medSchool.findMany({
    where: { active: true },
    select: { id: true, name: true, shortName: true, aliases: { select: { sourceKey: true } } },
  });
  return rows
    .filter((r) => schoolMatches({ ...r, terms: (r.aliases ?? []).map((a) => a.sourceKey) }, text))
    .map((r) => r.id);
}

export async function getLive(q: LiveQuery, now: Date = new Date()): Promise<MedLiveRes> {
  const limit = q.limit ?? 50;
  const cursor = q.cursor ? decodeLiveCursor(q.cursor) : null;
  const legacyProgram = q.program ?? 'ALL';
  const set = q.programs ? parsePrograms(q.programs) : undefined;
  const types = q.types ? q.types.split(',').map((w) => w.toUpperCase() as MedEventType) : undefined;
  // The program filter: a set maps to (degree, program) pairs; every program on is no filter and includes the events
  // that did not report one. The older `program` / `degree` parameters keep their meaning when no set is given.
  const programWhere = liveProgramWhere(set);
  const legacyWhere =
    set || legacyProgram === 'ALL' ? {} : legacyProgram === 'NONE' ? { program: null } : { program: legacyProgram };
  const text = q.q?.trim();
  // The index's matcher (`schoolMatches`: any name a source knows the school by, or its initials, "USC", "Keck"), run
  // over the active schools (a couple of hundred rows); "NC" is a state as well as a fragment of a name.
  const textWhere = text
    ? [
        {
          school: {
            OR: [
              { id: { in: await schoolIdsMatching(text) } },
              ...(text.length === 2 ? [{ state: text.toUpperCase() }] : []),
            ],
          },
        },
      ]
    : [];
  // "My cycle" / "My lists": an explicit slug list (user-independent); with `school` too, the two intersect.
  const schoolsWhere = q.schools ? [{ school: { slug: { in: slugsOf(q.schools) } } }] : [];
  const and = [...programWhere, ...textWhere, ...schoolsWhere];
  const rows = await prisma.medCycleEvent.findMany({
    where: {
      // RMH events are never public one by one (D5); they reach the public only as floored counts.
      source: { in: ['ADMIT', 'SDN'] },
      ...(types ? { eventType: { in: types } } : q.type ? { eventType: q.type } : {}),
      ...legacyWhere,
      // A school's own degree wins over a contradicting `degree`; a program set carries its own degrees.
      school: {
        active: true,
        ...(q.school ? { slug: q.school } : !set && q.degree ? { degree: q.degree } : {}),
        ...(q.state ? { state: { in: statesOf(q.state) } } : {}),
      },
      ...(cursor
        ? {
            OR: [
              { occurredAt: { lt: cursor.occurredAt } },
              { occurredAt: { equals: cursor.occurredAt }, id: { lt: cursor.id } },
            ],
          }
        : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    },
    select: {
      id: true,
      eventType: true,
      program: true,
      occurredAt: true,
      source: true,
      school: { select: { slug: true, shortName: true, name: true, degree: true, city: true, state: true } },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const waveDays = await liveWaveDays(page, now);
  return {
    events: page.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      program: r.program,
      school: {
        slug: r.school.slug,
        shortName: r.school.shortName,
        name: r.school.name,
        degree: r.school.degree,
        city: r.school.city,
        state: r.school.state,
      },
      occurredAt: truncateToMinute(r.occurredAt),
      source: r.source as 'ADMIT' | 'SDN',
      wave: r.eventType === 'INTERVIEW' && (waveDays.get(r.school.slug)?.has(day(r.occurredAt)) ?? false),
    })),
    nextCursor: rows.length > limit && last ? encodeLiveCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
    asOf: now.toISOString(),
  };
}

export async function getToday(q: TodayQuery, now: Date = new Date()): Promise<MedTodayRes> {
  const program = q.program ?? 'ALL';
  const cycleYear = await siteCycle(now);
  const today = day(now);
  const where = {
    cycleYear,
    eventType: 'INTERVIEW' as const,
    program: { in: programsOf(program) },
    school: { active: true, ...(q.degree ? { degree: q.degree } : {}) },
    // Positive on the figure the public sees: the published count for RMH, `count` for the rest. Combined with the
    // floor under AND, because each is an OR.
    AND: [
      floorWhere(now),
      {
        OR: [
          { source: { not: 'RMH' as const }, count: { gt: 0 } },
          { source: 'RMH' as const, publishedCount: { gt: 0 } },
        ],
      },
    ],
  };
  const latest = await prisma.medCycleCount.findFirst({
    where: { ...where, date: { lte: new Date(`${today}T00:00:00Z`) } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  if (!latest) return { date: null, isToday: false, program, schools: [] };
  const rows = await prisma.medCycleCount.findMany({
    where: { ...where, date: latest.date },
    select: {
      schoolId: true,
      source: true,
      count: true,
      publishedCount: true,
      school: { select: { slug: true, shortName: true, name: true, city: true, state: true } },
    },
  });
  const bySchool = new Map<string, { school: (typeof rows)[number]['school']; counts: Map<MedSource, number> }>();
  for (const r of rows) {
    const e = bySchool.get(r.schoolId) ?? { school: r.school, counts: new Map<MedSource, number>() };
    e.counts.set(r.source, (e.counts.get(r.source) ?? 0) + publicSum(r.source, r));
    bySchool.set(r.schoolId, e);
  }
  const schools = [...bySchool.values()].flatMap(({ school, counts }) => {
    const source = pickPrimary(counts.keys());
    return source ? [{ ...school, count: counts.get(source) ?? 0, source }] : [];
  });
  schools.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const date = day(latest.date);
  return { date, isToday: date === today, program, schools };
}
