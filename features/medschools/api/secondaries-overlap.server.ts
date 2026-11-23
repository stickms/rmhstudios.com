/**
 * The pre-write overlap for a member's list or tracker (private, never cached). It reads the caller's own rows only:
 * a list is reached through `{ id, userId }`, so another member's list is the same answer as a missing one (`not-found`,
 * a 404): no existence oracle. The prompts come from the same school view the public tab builds (`getSchoolViews`).
 * What leaves is schools by slug and name and their public prompts: no user id, list name, note, item id or position.
 */
import { prisma } from '@/lib/prisma.server';
import type { MedSecondaryOverlapRes } from '../medschools.contract';
import { cycleYearOf } from '../engine/cycle';
import { buildOverlap } from '../engine/secondaries/overlap';
import { LIMITS } from '../engine/tracker';
import type { MedProgram } from '../engine/types';
import { getSchoolViews } from './secondaries.server';

export type OverlapQuery = { source: 'list'; list: string } | { source: 'tracker' };

/** A list item's program decides which programs' prompts the member needs: ANY and REG read the regular ones. */
const programsOf = (program: string): MedProgram[] => (program === 'PHD' ? ['PHD'] : ['REG']);

export async function getOverlap(
  userId: string,
  q: OverlapQuery,
  now: Date = new Date(),
): Promise<MedSecondaryOverlapRes | 'not-found'> {
  // The secondary cycle, as the tracker lookup below and the stored prompts use it (not the site cycle, which follows interviews).
  const cycleYear = cycleYearOf(now, 'SECONDARY');
  const wanted: { schoolId: string; programs: MedProgram[] }[] = [];

  if (q.source === 'list') {
    const list = await prisma.medSchoolList.findFirst({ where: { id: q.list, userId }, select: { id: true } });
    if (!list) return 'not-found';
    const items = await prisma.medSchoolListItem.findMany({
      where: { listId: list.id },
      select: { schoolId: true, program: true },
    });
    for (const i of items.slice(0, LIMITS.itemsPerList))
      wanted.push({ schoolId: i.schoolId, programs: programsOf(i.program) });
  } else {
    const cycle = await prisma.medTrackerCycle.findFirst({
      where: { userId, cycleYear },
      select: { id: true },
    });
    if (cycle) {
      const apps = await prisma.medTrackerApplication.findMany({
        where: { cycleId: cycle.id },
        select: { schoolId: true, program: true },
      });
      for (const a of apps) wanted.push({ schoolId: a.schoolId, programs: programsOf(a.program) });
    }
  }

  const ids = [...new Set(wanted.map((w) => w.schoolId))];
  const schools =
    ids.length === 0
      ? []
      : await prisma.medSchool.findMany({
          where: { id: { in: ids }, active: true },
          select: { id: true, slug: true, name: true },
        });
  const views = await getSchoolViews(
    schools.map((s) => s.id),
    cycleYear,
  );
  const known = new Map(schools.map((s) => [s.id, s]));
  const overlap = buildOverlap(
    wanted.flatMap((w) => {
      const s = known.get(w.schoolId);
      return s ? [{ slug: s.slug, name: s.name, programs: w.programs, view: views.get(s.id)?.view ?? [] }] : [];
    }),
    cycleYear,
  );
  return {
    cycleYear,
    source: q.source,
    groups: overlap.groups.map((g) => ({
      theme: g.theme,
      schools: g.schools,
      shortestWords: g.shortestWords,
      longestWords: g.longestWords,
      entries: g.entries.map((e) => ({
        slug: e.slug,
        schoolName: e.schoolName,
        program: e.program,
        promptId: e.promptId,
        text: e.text,
        limit: e.limit ? { kind: e.limit.kind, value: e.limit.value } : null,
        optional: e.optional,
        basis: e.basis,
      })),
    })),
    withoutPrompts: overlap.withoutPrompts,
    schoolCount: known.size,
  };
}
