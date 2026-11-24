/**
 * An admin's correction of a school's own prompts (owner 2026-11-23: the import file is the source, this is for
 * fixes). The page URL is stored as the prompts' `sourceRef` and never fetched: nothing here makes a request.
 */
import { prisma } from '@/lib/prisma.server';
import { cycleYearOf } from '../engine/cycle';
import type { NormalizedPrompt } from '../engine/secondaries/types';
import { recordCheck, recordPrompts } from '../scrape/secondaries-store';
import type { MedPrisma } from '../scrape/types';
import type { AdminSecondariesBody } from './secondaries-schemas';

export async function recordSchoolPrompts(
  body: AdminSecondariesBody,
  now: Date = new Date(),
): Promise<{ prompts: number; created: number; rejected: number } | 'not-found'> {
  const school = await prisma.medSchool.findUnique({ where: { id: body.schoolId }, select: { id: true } });
  if (!school) return 'not-found';
  const prompts: NormalizedPrompt[] = body.prompts.map((p) => ({
    cycleYear: body.cycleYear,
    program: body.program,
    text: p.text,
    limit: p.limitKind && p.limitValue ? { kind: p.limitKind, value: p.limitValue } : null,
    optional: p.optional === true,
    sourceRef: body.sourceUrl,
  }));
  const db = prisma as unknown as MedPrisma;
  const r = await recordPrompts(db, {
    schoolId: school.id,
    source: 'SCHOOL',
    now,
    prompts,
    // An admin may enter the cycle in progress or an earlier one, never a future one.
    siteCycle: cycleYearOf(now, 'SECONDARY'),
  });
  if (r.prompts > 0) {
    await recordCheck(db, { schoolId: school.id, source: 'SCHOOL', now, status: 'OK', promptCount: r.prompts });
  }
  return { prompts: r.prompts, created: r.created, rejected: r.rejected };
}
