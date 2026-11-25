/**
 * The list builder's public read (phase D): every active school with its class profiles and MD-PhD facts, nothing else.
 * Institutional data only: this module imports no tracker, list, preference or stats module and takes no user id
 * (`api/builder/boundary.test.ts`). The shaping is the Facts tab's own (`classProfilesOf`, `mdphdOf`), so the builder
 * reads a figure exactly as the school page shows it. Explicit selects.
 */
import { prisma } from '@/lib/prisma.server';
import { MDPHD_CYCLE, MDPHD_KINDS, MDPHD_SOURCES } from '../../engine/mdphd';
import type { PublicSchool } from '../../engine/builder/candidates';
import { classProfilesOf, mdphdOf } from '../school-facts.server';

export async function readPublicSchools(): Promise<PublicSchool[]> {
  const [schools, profileRows, phdRows] = await Promise.all([
    prisma.medSchool.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true, shortName: true, city: true, state: true, degree: true },
    }),
    prisma.medSchoolFact.findMany({
      where: { source: 'SCHOOL_PROFILE', kind: { startsWith: 'PROFILE_' } },
      select: {
        schoolId: true,
        kind: true,
        program: true,
        cycleYear: true,
        valueText: true,
        valueNum: true,
        valueJson: true,
        sourceUrl: true,
        checkedOn: true,
      },
    }),
    prisma.medSchoolFact.findMany({
      where: {
        program: 'PHD',
        cycleYear: MDPHD_CYCLE,
        kind: { in: [...MDPHD_KINDS] },
        source: { in: [...MDPHD_SOURCES] },
      },
      select: {
        schoolId: true,
        kind: true,
        source: true,
        valueText: true,
        valueNum: true,
        valueJson: true,
        note: true,
        sourceUrl: true,
        checkedOn: true,
      },
    }),
  ]);
  const group = <T extends { schoolId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.schoolId, [...(m.get(r.schoolId) ?? []), r]);
    return m;
  };
  const profiles = group(profileRows);
  const phd = group(phdRows);
  return schools.flatMap((s): PublicSchool[] =>
    s.degree === 'MD' || s.degree === 'DO'
      ? [
          {
            slug: s.slug,
            name: s.name,
            shortName: s.shortName,
            city: s.city,
            state: s.state,
            degree: s.degree,
            classes: classProfilesOf(profiles.get(s.id) ?? []),
            mdphd: mdphdOf(phd.get(s.id) ?? []),
          },
        ]
      : [],
  );
}
