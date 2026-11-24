/**
 * What the caller's own list or tracker schools say about rolling decisions (private, never cached). It reads the
 * caller's own rows only: a list is reached through `{ id, userId }`, so another member's list is the same answer as a
 * missing one (`not-found`, a 404): no existence oracle. The facts are the public policy rows (a school's own page,
 * quoted). What leaves is schools by slug and name and those public facts: no user id, list name, note, item id or
 * position.
 */
import { prisma } from '@/lib/prisma.server';
import type { MedRollingGuidanceRes } from '../medschools.contract';
import { cycleYearOf } from '../engine/cycle';
import { buildRolling, type RollingInput, type RollingPolicy } from '../engine/rolling';
import { LIMITS } from '../engine/tracker';
import type { MedProgram } from '../engine/types';

export type RollingQuery = { source: 'list'; list: string } | { source: 'tracker' };

const day = (d: Date): string => d.toISOString().slice(0, 10);

export async function getRollingGuidance(
  userId: string,
  q: RollingQuery,
  now: Date = new Date(),
): Promise<MedRollingGuidanceRes | 'not-found'> {
  // The secondary cycle, as the tracker lookup below and the overlap use it.
  const cycleYear = cycleYearOf(now, 'SECONDARY');
  const wanted: { schoolId: string; program: 'ANY' | MedProgram; submitted: boolean | null }[] = [];

  if (q.source === 'list') {
    const list = await prisma.medSchoolList.findFirst({ where: { id: q.list, userId }, select: { id: true } });
    if (!list) return 'not-found';
    const items = await prisma.medSchoolListItem.findMany({
      where: { listId: list.id },
      select: { schoolId: true, program: true, position: true },
    });
    items.sort((a, b) => a.position - b.position);
    for (const i of items.slice(0, LIMITS.itemsPerList))
      wanted.push({ schoolId: i.schoolId, program: i.program, submitted: null });
  } else {
    const cycle = await prisma.medTrackerCycle.findFirst({ where: { userId, cycleYear }, select: { id: true } });
    if (cycle) {
      const apps = await prisma.medTrackerApplication.findMany({
        where: { cycleId: cycle.id },
        select: { id: true, schoolId: true, program: true, createdAt: true },
      });
      apps.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
      const steps =
        apps.length === 0
          ? []
          : await prisma.medTrackerMilestone.findMany({
              where: { applicationId: { in: apps.map((a) => a.id) } },
              select: { applicationId: true },
            });
      const started = new Set(steps.map((s) => s.applicationId));
      for (const a of apps) wanted.push({ schoolId: a.schoolId, program: a.program, submitted: started.has(a.id) });
    }
  }

  const ids = [...new Set(wanted.map((w) => w.schoolId))];
  const [schools, policies] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.medSchool.findMany({
            where: { id: { in: ids }, active: true },
            select: { id: true, slug: true, name: true, degree: true },
          }),
          prisma.medSchoolAdmissionsPolicy.findMany({
            where: { schoolId: { in: ids } },
            select: { schoolId: true, program: true, rolling: true, evidence: true, url: true, checkedOn: true },
          }),
        ]);
  const known = new Map(schools.map((s) => [s.id, s]));
  const factsOf = new Map<string, Partial<Record<MedProgram, RollingPolicy>>>();
  for (const p of policies) {
    const facts = factsOf.get(p.schoolId) ?? {};
    facts[p.program] = { rolling: p.rolling, evidence: p.evidence, url: p.url, checkedOn: day(p.checkedOn) };
    factsOf.set(p.schoolId, facts);
  }
  const inputs = wanted.flatMap((w): RollingInput[] => {
    const s = known.get(w.schoolId);
    return s
      ? [
          {
            slug: s.slug,
            schoolName: s.name,
            degree: s.degree,
            program: w.program,
            submitted: w.submitted,
            policies: factsOf.get(w.schoolId) ?? {},
          },
        ]
      : [];
  });
  return {
    cycleYear,
    source: q.source,
    entries: buildRolling(inputs).map((e) => ({
      slug: e.slug,
      schoolName: e.schoolName,
      degree: e.degree,
      program: e.program,
      kind: e.kind,
      evidence: e.evidence,
      url: e.url,
      checkedOn: e.checkedOn,
      submitted: e.submitted,
    })),
    schoolCount: known.size,
  };
}
