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
  floorSplit,
  pickPrimary,
  resolveCycleYear,
  toCumulativeByDay,
  truncateToMinute,
  utcDayOf,
  type CountCell,
} from '../engine/public-read';
import { defaultDayZero } from '../engine/cycle';
import type { MedEventType, MedProgram, MedSource } from '../engine/types';
import type {
  ActivityTypeDto,
  HistoryCycleDto,
  ListMedSchoolsRes,
  MedChartedTypeId,
  MedDegreeId,
  MedLiveRes,
  MedSourceId,
  MedProgramFilter,
  MedSchoolActivityRes,
  MedSchoolDetailDto,
  MedSchoolHistoryRes,
  MedTodayRes,
} from '../medschools.contract';
import type { ActivityQuery, HistoryQuery, ListSchoolsQuery, LiveQuery, TodayQuery } from './read-schemas';
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

/**
 * The k floor as a where clause. An RMH row is public only through its daily snapshot (Q2): `publishedContributors >=
 * K_FLOOR` (null, never published, fails closed) and a date before today UTC. The live `count` / `contributors` follow
 * the tracker minute by minute and are never read for a public figure. Same rule as applyKFloor.
 */
const floorWhere = (now: Date) => ({
  OR: [
    { source: { not: 'RMH' as const } },
    {
      source: 'RMH' as const,
      publishedContributors: { gte: K_FLOOR },
      date: { lt: new Date(`${utcDayOf(now)}T00:00:00.000Z`) },
    },
  ],
});

/** A summed groupBy row as one public figure: an RMH row's published total, any other source's `count`. */
const publicSum = (source: MedSource, s: { count: number | null; publishedCount: number | null }): number =>
  (source === 'RMH' ? s.publishedCount : s.count) ?? 0;

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

export async function listSchools(q: ListSchoolsQuery, now: Date = new Date()): Promise<ListMedSchoolsRes> {
  const program = q.program ?? 'ALL';
  const [all, cycleYear] = await Promise.all([
    prisma.medSchool.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true, shortName: true, degree: true, city: true, state: true },
      orderBy: { name: 'asc' },
    }),
    siteCycle(now),
  ]);
  const sums = await prisma.medCycleCount.groupBy({
    by: ['schoolId', 'source'],
    where: { cycleYear, eventType: 'INTERVIEW', program: { in: programsOf(program) }, ...floorWhere(now) },
    _sum: { count: true, publishedCount: true },
  });
  const bySchool = new Map<string, { source: MedSource; count: number }[]>();
  for (const s of sums) {
    const list = bySchool.get(s.schoolId) ?? [];
    list.push({ source: s.source, count: publicSum(s.source, s._sum) });
    bySchool.set(s.schoolId, list);
  }
  const filtered = filterSchools(all, { q: q.q, degree: q.degree, state: q.state });
  return {
    cycleYear,
    program,
    states: [...new Set(all.map((s) => s.state))].sort(),
    schools: filtered.map((s) => {
      const list = bySchool.get(s.id) ?? [];
      const primary = pickPrimary(list.map((x) => x.source));
      const hit = list.find((x) => x.source === primary);
      return {
        slug: s.slug,
        name: s.name,
        shortName: s.shortName,
        degree: s.degree,
        city: s.city,
        state: s.state,
        reported: hit ? { source: hit.source, count: hit.count } : null,
      };
    }),
  };
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
        program: { in: programsOf(program) },
        eventType: { in: [...CHARTED_TYPES, ...OTHER_TOTAL_TYPES] },
      },
      select: {
        source: true,
        date: true,
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
  const cells = sumPrograms(
    rows.flatMap((r) => publicCell({ ...r, date: day(r.date) }) ?? []),
    utcDayOf(now),
  );
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
  return {
    cycleYear,
    program,
    dayZeroOn: cycle ? day(cycle.dayZeroOn) : defaultDayZero(cycleYear),
    dayZeroEstimated: cycle ? cycle.dateEstimated : true,
    types,
    otherTotals,
    unreportedProgram: unreported.count,
    unreportedProgramSource: unreported.source,
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

export async function getLive(q: LiveQuery, now: Date = new Date()): Promise<MedLiveRes> {
  const limit = q.limit ?? 50;
  const cursor = q.cursor ? decodeLiveCursor(q.cursor) : null;
  const program = q.program ?? 'ALL';
  const rows = await prisma.medCycleEvent.findMany({
    where: {
      // RMH events are never public one by one (D5); they reach the public only as floored counts.
      source: { in: ['ADMIT', 'SDN'] },
      ...(q.type ? { eventType: q.type } : {}),
      ...(program === 'REG' || program === 'PHD' ? { program } : program === 'NONE' ? { program: null } : {}),
      // A school's own degree wins over a contradicting `degree`.
      school: { active: true, ...(q.school ? { slug: q.school } : q.degree ? { degree: q.degree } : {}) },
      ...(cursor
        ? {
            OR: [
              { occurredAt: { lt: cursor.occurredAt } },
              { occurredAt: { equals: cursor.occurredAt }, id: { lt: cursor.id } },
            ],
          }
        : {}),
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
