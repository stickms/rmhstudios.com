import { prisma } from '@/lib/prisma.server';
import { utcDayOf } from '../engine/public-read';
import { parsePrograms } from '../engine/programs';
import type { MedEventType } from '../engine/types';
import type { LiveSchoolDto, MedLiveSummaryRes } from '../medschools.contract';
import type { LiveSummaryQuery } from './read-schemas';
import { liveProgramWhere, liveStatesOf, schoolWaves, siteCycleYear } from './read.server';

/** The window: reported events of the last 24 hours by `occurredAt`. */
export const SUMMARY_WINDOW_MS = 24 * 3_600_000;
/** "Most active": the top five schools. */
export const SUMMARY_ACTIVE = 5;
/** "Waves now": at most this many schools. */
export const SUMMARY_WAVES = 5;

/** Most first; a tie reads in name order, so the answer is stable. */
const byCountThenName = (
  a: { count: number; school: { name: string } },
  b: { count: number; school: { name: string } },
) => b.count - a.count || a.school.name.localeCompare(b.school.name);

/**
 * The live page's "Today" column (owner 2026-11-24). The live feed's event source and rules: `MedCycleEvent`, Admit and
 * SDN only (an RMH event is never public one by one, D5), active schools, the site cycle, the live feed's `programs` and
 * `state` filters, and `occurredAt` within the last 24 hours. One `groupBy` (school x type) answers both the counts by
 * type and the most active schools; the schools are then read with an explicit `select`; "Waves now" is the live
 * feed's own wave rule (`schoolWaves`) on today's UTC day, for the schools that had an invite in the window. Nothing
 * about the viewer is read: the body is the same for every caller and is cached publicly.
 */
export async function getLiveSummary(q: LiveSummaryQuery, now: Date = new Date()): Promise<MedLiveSummaryRes> {
  const since = new Date(now.getTime() - SUMMARY_WINDOW_MS);
  const cycleYear = await siteCycleYear(now);
  const set = q.programs ? parsePrograms(q.programs) : undefined;
  const and = liveProgramWhere(set);
  const states = liveStatesOf(q.state);
  const grouped = await prisma.medCycleEvent.groupBy({
    by: ['schoolId', 'eventType'],
    where: {
      // RMH events are never public one by one (D5); they reach the public only as floored counts.
      source: { in: ['ADMIT', 'SDN'] },
      cycleYear,
      occurredAt: { gte: since, lte: now },
      school: { active: true, ...(states ? { state: { in: states } } : {}) },
      ...(and.length > 0 ? { AND: and } : {}),
    },
    _count: { _all: true },
  });

  const byType = new Map<MedEventType, number>();
  const bySchool = new Map<string, number>();
  const invited = new Set<string>();
  for (const g of grouped) {
    const n = g._count._all;
    if (n <= 0) continue;
    byType.set(g.eventType, (byType.get(g.eventType) ?? 0) + n);
    bySchool.set(g.schoolId, (bySchool.get(g.schoolId) ?? 0) + n);
    if (g.eventType === 'INTERVIEW') invited.add(g.schoolId);
  }
  const counts = [...byType]
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));

  const ids = [...bySchool.keys()];
  const schools =
    ids.length === 0
      ? []
      : await prisma.medSchool.findMany({
          where: { id: { in: ids }, active: true },
          select: { id: true, slug: true, shortName: true, name: true, degree: true, city: true, state: true },
        });
  const school = new Map<string, LiveSchoolDto>(
    schools.map((s) => [
      s.id,
      { slug: s.slug, shortName: s.shortName, name: s.name, degree: s.degree, city: s.city, state: s.state },
    ]),
  );

  const active = [...bySchool]
    .flatMap(([id, count]) => {
      const s = school.get(id);
      return s ? [{ school: s, count }] : [];
    })
    .sort(byCountThenName)
    .slice(0, SUMMARY_ACTIVE);

  const today = utcDayOf(now);
  const invitedSchools = [...invited].flatMap((id) => school.get(id) ?? []);
  const waveDays = await schoolWaves(
    invitedSchools.map((s) => s.slug),
    [cycleYear],
    now,
  );
  const waves = invitedSchools
    .flatMap((s) => {
      const count = waveDays.get(s.slug)?.get(today);
      return count === undefined ? [] : [{ school: s, count }];
    })
    .sort(byCountThenName)
    .slice(0, SUMMARY_WAVES);

  return { asOf: now.toISOString(), since: since.toISOString(), counts, waves, active };
}
