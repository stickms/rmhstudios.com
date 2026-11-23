/**
 * The member's own med schools data for the account export (`GET /api/account/export`): the private tracker, the
 * saved lists and the preferences, with schools named by slug. No row id, no user id, and nothing that identifies a
 * shared anonymous event (the event hash is never stored anywhere a member's row could reach, and is not exported).
 */
import { prisma } from '@/lib/prisma.server';

const day = (d: Date): string => d.toISOString().slice(0, 10);

export interface MedschoolsExport {
  tracker: {
    cycleYear: number;
    homeState: string | null;
    shareAnonymously: boolean;
    applications: {
      school: string;
      program: string;
      notes: string | null;
      milestones: { type: string; date: string }[];
    }[];
  }[];
  lists: { name: string; items: { school: string; program: string | null; note: string | null }[] }[];
  prefs: { programFilter: string; degree: string | null; homeState: string | null; chartCategories: string[] };
}

export async function exportMedschools(userId: string): Promise<MedschoolsExport> {
  const cycles = await prisma.medTrackerCycle.findMany({
    where: { userId },
    select: { id: true, cycleYear: true, homeState: true, shareAnonymously: true },
  });
  const apps = cycles.length
    ? await prisma.medTrackerApplication.findMany({
        where: { cycleId: { in: cycles.map((c) => c.id) } },
        select: { id: true, cycleId: true, schoolId: true, program: true, notes: true },
      })
    : [];
  const milestones = apps.length
    ? await prisma.medTrackerMilestone.findMany({
        where: { applicationId: { in: apps.map((a) => a.id) } },
        select: { applicationId: true, type: true, date: true },
      })
    : [];
  const lists = await prisma.medSchoolList.findMany({
    where: { userId },
    select: { id: true, name: true, position: true },
  });
  const items = lists.length
    ? await prisma.medSchoolListItem.findMany({
        where: { listId: { in: lists.map((l) => l.id) } },
        select: { listId: true, schoolId: true, program: true, note: true, position: true },
      })
    : [];
  const schoolIds = [...new Set([...apps.map((a) => a.schoolId), ...items.map((i) => i.schoolId)])];
  const schools = schoolIds.length
    ? await prisma.medSchool.findMany({ where: { id: { in: schoolIds } }, select: { id: true, slug: true } })
    : [];
  const slug = new Map(schools.map((s) => [s.id, s.slug]));
  const prefs = await prisma.medUserPrefs.findUnique({
    where: { userId },
    select: { programFilter: true, degree: true, homeState: true, chartCategories: true },
  });

  return {
    tracker: [...cycles]
      .sort((a, b) => b.cycleYear - a.cycleYear)
      .map((c) => ({
        cycleYear: c.cycleYear,
        homeState: c.homeState,
        shareAnonymously: c.shareAnonymously,
        applications: apps
          .filter((a) => a.cycleId === c.id)
          .map((a) => ({
            school: slug.get(a.schoolId) ?? '',
            program: a.program,
            notes: a.notes,
            milestones: milestones
              .filter((m) => m.applicationId === a.id)
              .map((m) => ({ type: m.type, date: day(m.date) }))
              .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.type < y.type ? -1 : 1)),
          })),
      })),
    lists: [...lists]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        name: l.name,
        items: items
          .filter((i) => i.listId === l.id)
          .sort((a, b) => a.position - b.position)
          .map((i) => ({ school: slug.get(i.schoolId) ?? '', program: i.program, note: i.note })),
      })),
    prefs: prefs
      ? {
          programFilter: prefs.programFilter,
          degree: prefs.degree,
          homeState: prefs.homeState,
          chartCategories: [...prefs.chartCategories],
        }
      : { programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] },
  };
}
