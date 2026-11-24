import { prisma } from '@/lib/prisma.server';
import { FACT_KINDS, MSAR_PAGE_URL, MSAR_REPORTS, isFactKind, type MsarReportId } from '../engine/school-facts';
import type { MedSchoolFactDto, MedSchoolFactsRes } from '../medschools.contract';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const day = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The facts of one active school, in the catalogue's order. Explicit `select`: nothing but the columns the DTO names.
 * One value per kind (the unique key is school x program x cycle x kind x source; today there is one source and one
 * cycle per kind), and nothing is averaged or merged across sources.
 */
export async function getSchoolFacts(slug: string): Promise<MedSchoolFactsRes | null> {
  if (!SLUG_RE.test(slug)) return null;
  const school = await prisma.medSchool.findFirst({ where: { slug, active: true }, select: { id: true } });
  if (!school) return null;
  const rows = await prisma.medSchoolFact.findMany({
    where: { schoolId: school.id, program: 'REG' },
    select: {
      kind: true,
      reportId: true,
      cycleYear: true,
      valueText: true,
      valueNum: true,
      valueJson: true,
      note: true,
      sourceUrl: true,
      sourceLabel: true,
      checkedOn: true,
    },
  });
  const order = Object.keys(FACT_KINDS);
  const facts: MedSchoolFactDto[] = rows
    .filter((r) => isFactKind(r.kind) && r.reportId !== null)
    .map((r) => {
      const json = r.valueJson as { text?: unknown } | null;
      return {
        kind: r.kind,
        reportId: r.reportId!,
        report: MSAR_REPORTS[r.reportId as MsarReportId] ?? '',
        cycleYear: r.cycleYear,
        value: r.valueText,
        printed: json && typeof json.text === 'string' ? json.text : null,
        num: r.valueNum,
        note: r.note,
        sourceUrl: r.sourceUrl,
        sourceLabel: r.sourceLabel,
        checkedOn: day(r.checkedOn),
      };
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { pageUrl: MSAR_PAGE_URL, facts };
}
