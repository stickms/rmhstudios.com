/**
 * Admit.org curriculum facts -> `MedSchoolFact` rows (source `ADMIT`). Pure writes over the `MedPrisma` seam; the job
 * (`run-admit-curriculum.ts`) fetches, this stores. One row per school x kind, upserted on the fact's unique key
 * (`CURRICULUM_CYCLE` stands in for the entering class, so the weekly refresh updates in place), and a kind Admit stopped
 * publishing for a school is deleted. Only `ADMIT` rows are ever read or deleted here: the AAMC rows are not touched.
 */
import { ADMIT_SOURCE_LABEL, ADMIT_SOURCE_URL, CURRICULUM_CYCLE } from '../engine/school-facts';
import type { AdmitCurriculum } from './adapters/admit';
import { ADMIT_SCHOOL_URL } from './sources';
import type { Logger, MedPrisma } from './types';

export interface AdmitCurriculumImportSummary {
  /** Schools in the reply that matched an active school. */
  schools: number;
  /** Schools in the reply with no alias or an inactive school: counted, never named (no alias-miss row either). */
  unmatched: number;
  facts: number;
  removed: number;
}

const dayDate = (d: Date): Date => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);

/** The columns of one fact. `valueJson.text` is the verbatim string (the same slot the AAMC rows use for the printed text). */
export function curriculumFactRow(fact: AdmitCurriculum['facts'][number], slug: string, fetchedOn: Date) {
  return {
    program: 'REG' as const,
    cycleYear: CURRICULUM_CYCLE,
    kind: fact.kind,
    valueNum: fact.num,
    valueText: fact.code,
    valueJson: fact.verbatim === null ? null : { text: fact.verbatim },
    note: null,
    source: 'ADMIT' as const,
    // The school's own Admit page when the site pattern is known (`ADMIT_SCHOOL_URL`, undefined today), else Admit's home.
    sourceUrl: ADMIT_SCHOOL_URL?.(slug) ?? ADMIT_SOURCE_URL,
    sourceLabel: ADMIT_SOURCE_LABEL,
    reportId: null,
    page: null,
    checkedOn: dayDate(fetchedOn),
  };
}

export async function importAdmitCurriculum(
  prisma: MedPrisma,
  schools: AdmitCurriculum[],
  opts: { fetchedOn: Date; log: Pick<Logger, 'info' | 'warn'>; shouldStop?: () => boolean },
): Promise<AdmitCurriculumImportSummary & { stopped: boolean }> {
  const out = { schools: 0, unmatched: 0, facts: 0, removed: 0, stopped: false };
  const aliases = await prisma.medSchoolAlias.findMany({ where: { source: 'ADMIT' } });
  const active = new Set((await prisma.medSchool.findMany({ where: { active: true } })).map((s) => s.id));
  const schoolBySlug = new Map(aliases.map((a) => [a.sourceKey, a.schoolId]));

  for (const entry of schools) {
    if (opts.shouldStop?.()) {
      out.stopped = true;
      break;
    }
    const schoolId = schoolBySlug.get(entry.schoolKey);
    if (schoolId === undefined || !active.has(schoolId)) {
      out.unmatched += 1;
      continue;
    }
    out.schools += 1;
    const keep = new Set<string>();
    for (const fact of entry.facts) {
      const row = curriculumFactRow(fact, entry.schoolKey, opts.fetchedOn);
      const saved = await prisma.medSchoolFact.upsert({
        where: {
          schoolId_program_cycleYear_kind_source: {
            schoolId,
            program: row.program,
            cycleYear: row.cycleYear,
            kind: row.kind,
            source: row.source,
          },
        },
        create: { schoolId, ...row },
        update: row,
      });
      keep.add(saved.id);
      out.facts += 1;
    }
    // A kind Admit no longer publishes for this school is gone. ADMIT rows of this school only.
    const existing = await prisma.medSchoolFact.findMany({ where: { schoolId, source: 'ADMIT' } });
    const stale = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
    if (stale.length > 0) {
      const r = await prisma.medSchoolFact.deleteMany({ where: { id: { in: stale }, source: 'ADMIT' } });
      out.removed += r.count;
    }
  }
  opts.log.info(
    `admit-curriculum: schools=${out.schools} unmatched=${out.unmatched} facts=${out.facts} removed=${out.removed}`,
  );
  return out;
}
