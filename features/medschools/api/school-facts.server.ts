import { prisma } from '@/lib/prisma.server';
import {
  CURRICULUM_KIND_IDS,
  FACT_KINDS,
  MSAR_PAGE_URL,
  MSAR_REPORTS,
  isCurriculumKind,
  isFactKind,
  type MsarReportId,
} from '../engine/school-facts';
import type { MedSchoolFactDto, MedSchoolFactsRes } from '../medschools.contract';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const day = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The facts of one active school, in the catalogue's order. Explicit `select`: nothing but the columns the DTO names.
 * One value per kind (the unique key is school x program x cycle x kind x source; each kind has one source and one
 * cycle), and nothing is averaged or merged across sources. Two catalogues: the AAMC report facts (source
 * `AAMC_MSAR_REPORT`, with a report id) and Admit's curriculum facts (source `ADMIT`, `reportId` null). A row is shown
 * only when its kind belongs to the catalogue of its own source, so a stray kind never reaches the page.
 */
export async function getSchoolFacts(slug: string): Promise<MedSchoolFactsRes | null> {
  if (!SLUG_RE.test(slug)) return null;
  const school = await prisma.medSchool.findFirst({ where: { slug, active: true }, select: { id: true } });
  if (!school) return null;
  const rows = await prisma.medSchoolFact.findMany({
    where: { schoolId: school.id, program: 'REG' },
    select: {
      kind: true,
      source: true,
      reportId: true,
      cycleYear: true,
      valueText: true,
      valueNum: true,
      valueJson: true,
      note: true,
      sourceUrl: true,
      sourceLabel: true,
      checkedOn: true,
      page: true,
    },
  });
  const order: string[] = [...Object.keys(FACT_KINDS), ...CURRICULUM_KIND_IDS];
  const facts: MedSchoolFactDto[] = rows
    .filter((r) =>
      r.source === 'ADMIT'
        ? isCurriculumKind(r.kind)
        : r.source === 'AAMC_MSAR_REPORT' && isFactKind(r.kind) && r.reportId !== null,
    )
    .map((r) => {
      const json = r.valueJson as { text?: unknown } | null;
      return {
        kind: r.kind,
        reportId: r.reportId,
        report: r.reportId === null ? '' : (MSAR_REPORTS[r.reportId as MsarReportId] ?? ''),
        cycleYear: r.cycleYear,
        value: r.valueText,
        printed: json && typeof json.text === 'string' ? json.text : null,
        num: r.valueNum,
        note: r.note,
        sourceUrl: r.sourceUrl,
        sourceLabel: r.sourceLabel,
        checkedOn: day(r.checkedOn),
        page: r.page,
      };
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { pageUrl: MSAR_PAGE_URL, facts };
}
