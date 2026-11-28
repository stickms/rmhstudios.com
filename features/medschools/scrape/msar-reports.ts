/**
 * The curated import of the AAMC MSAR "Reports for Applicants and Advisors" (roadmap item 11, phase C step 1). The
 * reports were downloaded once by hand, read by `scripts/medschools/msar_extract.py` and
 * `parse-msar-reports.ts`, and checked in as `data/medschools/msar-reports.json`; this module validates that file and
 * loads it. There is NO recurring job and no request to AAMC anywhere: the import reads a file.
 *
 * Permission and scope: the owner states that RMH has AAMC's permission to use what is on the reports page (2026-11-24);
 * the file's `permission` header records it. The MSAR school profiles are not covered and are not used. The reports are
 * MD (AMCAS) schools only, so a DO school gets nothing from here.
 *
 * What it writes, all idempotent: one `MedSchoolFact` row per school x kind (source `AAMC_MSAR_REPORT`, program REG: the
 * reports are about the MD program). A rerun changes nothing; a fact dropped from a newer file is deleted, so the table
 * always equals the file.
 */
import { z } from 'zod';
import { SCHOOL_SLUG_RE } from '../engine/school-slug';
import {
  FACT_CODES,
  FACT_KINDS,
  MSAR_PAGE_URL,
  MSAR_REPORTS,
  factSourceLine,
  isFactKind,
  msarReportUrl,
  type FactKindId,
} from '../engine/school-facts';
import type { Logger, MedPrisma } from './types';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const reportSchema = z
  .object({
    name: z.string().min(1).max(200),
    url: z.string().url(),
    /** The year the PDF itself prints (the entering class). */
    cycleYear: z.number().int().min(2020).max(2100),
    /** Whether the PDF prints that year (the PREview PDF prints none; the AAMC page lists it under 2027). */
    yearPrinted: z.boolean(),
    /** The PDF's own "Source:" line. */
    pdfSource: z.string().min(1).max(300).nullable(),
    pages: z.number().int().min(1).max(1000),
  })
  .strict();

const factSchema = z
  .object({
    report: z.number().int(),
    kind: z.string(),
    page: z.number().int().min(1).max(1000),
    code: z.string().max(40).optional(),
    num: z.number().finite().optional(),
    text: z.string().min(1).max(8000).optional(),
    note: z.string().min(1).max(8000).optional(),
  })
  .strict();

const schoolSchema = z
  .object({
    slug: z.string().regex(SCHOOL_SLUG_RE),
    /** The school's name as the PDF prints it, by report id. */
    names: z.record(z.string(), z.string().min(1).max(300)),
    facts: z.array(factSchema).min(1).max(80),
  })
  .strict();

const unmatchedSchema = z.object({ report: z.number().int(), state: z.string(), name: z.string() }).strict();

export const msarReportsFileSchema = z
  .object({
    source: z.string().min(1),
    sourceUrl: z.literal(MSAR_PAGE_URL),
    permission: z.string().min(1),
    method: z.string().min(1),
    fetchedOn: day,
    cycleLabel: z.string().min(1),
    reports: z.record(z.string(), reportSchema),
    canadianSchoolsSkipped: z.number().int().min(0),
    unmatched: z.array(unmatchedSchema),
    schools: z.array(schoolSchema).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    for (const [id, r] of Object.entries(f.reports)) {
      const known = (MSAR_REPORTS as Record<string, string>)[id];
      if (!known) bad(`report ${id} is not one this import knows`);
      else if (known !== r.name) bad(`report ${id} is named ${r.name}, expected ${known}`);
      if (r.url !== msarReportUrl(Number(id))) bad(`report ${id}: url is not the AAMC media link`);
    }
    const slugs = new Set<string>();
    for (const s of f.schools) {
      if (slugs.has(s.slug)) bad(`${s.slug}: listed twice`);
      slugs.add(s.slug);
      const seen = new Set<string>();
      for (const fact of s.facts) {
        const at = `${s.slug} ${fact.kind}`;
        if (!isFactKind(fact.kind)) {
          bad(`${at}: unknown kind`);
          continue;
        }
        const spec = FACT_KINDS[fact.kind];
        if (spec.report !== fact.report) bad(`${at}: belongs to report ${spec.report}, not ${fact.report}`);
        if (!f.reports[String(fact.report)]) bad(`${at}: report ${fact.report} is not in the header`);
        if (seen.has(fact.kind)) bad(`${at}: twice`);
        seen.add(fact.kind);
        const t = spec.type;
        if (t === 'accepts' || t === 'yesno' || t === 'letter' || t === 'preview') {
          if (!fact.code || !(FACT_CODES[t] as readonly string[]).includes(fact.code))
            bad(`${at}: code ${fact.code} is not one of ${FACT_CODES[t].join(', ')}`);
          if (fact.num !== undefined) bad(`${at}: no number on a status`);
          if (t === 'preview' && !fact.text) bad(`${at}: the school's sentence is required`);
        } else if (t === 'date') {
          if (!fact.code || !/^\d{4}-\d{2}(-\d{2})?$/.test(fact.code) || !fact.text)
            bad(`${at}: a date needs a code and its text`);
        } else if (t === 'usd' || t === 'percent') {
          if (fact.num === undefined || fact.num < 0 || !fact.text) bad(`${at}: a figure needs a number and its text`);
          if (t === 'percent' && (fact.num ?? 0) > 100) bad(`${at}: a percent over 100`);
        } else if (!fact.text) bad(`${at}: text is required`);
      }
    }
  });

export type MsarReportsFile = z.infer<typeof msarReportsFileSchema>;
export type MsarFactEntry = MsarReportsFile['schools'][number]['facts'][number];

export interface MsarImportSummary {
  schools: number;
  missingSchools: string[];
  facts: number;
  removed: number;
}

const dayDate = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

/** The columns of one fact. `valueText` is the code of a status or the school's words; `valueJson` keeps the printed text beside a code. */
export function factRow(file: MsarReportsFile, fact: MsarFactEntry) {
  const report = file.reports[String(fact.report)]!;
  return {
    program: 'REG' as const,
    cycleYear: report.cycleYear,
    kind: fact.kind as FactKindId,
    valueNum: fact.num ?? null,
    valueText: fact.code ?? fact.text ?? null,
    valueJson: fact.code && fact.text ? { text: fact.text } : null,
    note: fact.note ?? null,
    source: 'AAMC_MSAR_REPORT' as const,
    sourceUrl: report.url,
    sourceLabel: factSourceLine(report.name, report.cycleYear, report.pdfSource).replace(/^Source: /, ''),
    reportId: fact.report,
    page: fact.page,
    checkedOn: dayDate(file.fetchedOn),
  };
}

export async function importMsarReports(
  prisma: MedPrisma,
  file: MsarReportsFile,
  log: Pick<Logger, 'info' | 'warn'>,
): Promise<MsarImportSummary> {
  const out: MsarImportSummary = { schools: 0, missingSchools: [], facts: 0, removed: 0 };
  const schools = await prisma.medSchool.findMany({ select: { id: true, slug: true } });
  const idOf = new Map(schools.map((s) => [s.slug, s.id]));
  const keep = new Set<string>();

  for (const entry of file.schools) {
    const schoolId = idOf.get(entry.slug);
    if (!schoolId) {
      out.missingSchools.push(entry.slug);
      continue;
    }
    out.schools += 1;
    for (const fact of entry.facts) {
      const row = factRow(file, fact);
      const where = {
        schoolId_program_cycleYear_kind_source: {
          schoolId,
          program: row.program,
          cycleYear: row.cycleYear,
          kind: row.kind,
          source: row.source,
        },
      };
      const saved = await prisma.medSchoolFact.upsert({
        where,
        create: { schoolId, ...row },
        update: row,
      });
      keep.add(saved.id);
      out.facts += 1;
    }
  }
  // A fact the file no longer holds is gone from the table: it equals the file.
  const existing = await prisma.medSchoolFact.findMany({ where: { source: 'AAMC_MSAR_REPORT' } });
  const stale = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (stale.length > 0 && out.missingSchools.length === 0) {
    const r = await prisma.medSchoolFact.deleteMany({ where: { id: { in: stale } } });
    out.removed = r.count;
  }
  log.info(`msar-reports: schools=${out.schools} facts=${out.facts} removed=${out.removed}`);
  if (out.missingSchools.length > 0) log.warn(`msar-reports: unknown slugs skipped: ${out.missingSchools.join(', ')}`);
  return out;
}

export const MSAR_REPORTS_JOB = 'msar-reports-import';

/** A stable fingerprint of the file's content: a new version of the data imports again, the same one never does. */
export function msarReportsHash(raw: unknown): string {
  const text = JSON.stringify(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}-${h.toString(16)}`;
}

/**
 * The worker's bootstrap step: imports `data/medschools/msar-reports.json` once per version of the file (a
 * `MedSourceRun` with job `msar-reports-import`, status OK and the file's hash is the done flag). The import is
 * idempotent, so a failed or repeated run is harmless; this only keeps it from re-reading the file on every restart.
 */
export async function ensureMsarReportsImported(
  prisma: MedPrisma,
  raw: unknown,
  log: Pick<Logger, 'info' | 'warn' | 'error'>,
  now: () => Date = () => new Date(),
): Promise<'imported' | 'current' | 'invalid' | 'failed'> {
  const parsed = msarReportsFileSchema.safeParse(raw);
  if (!parsed.success) {
    log.error(`MSAR reports: data file is invalid (${parsed.error.issues.length} issues); nothing imported`);
    return 'invalid';
  }
  const hash = msarReportsHash(raw);
  const last = await prisma.medSourceRun.findFirst({
    where: { source: 'RMH', job: MSAR_REPORTS_JOB, status: 'OK' },
    orderBy: { startedAt: 'desc' },
  });
  const lastHash = (last?.stats as { hash?: unknown } | null | undefined)?.hash;
  if (lastHash === hash) return 'current';
  const run = await prisma.medSourceRun.create({
    data: { source: 'RMH', job: MSAR_REPORTS_JOB, trigger: 'BOOTSTRAP', status: 'RUNNING' },
  });
  try {
    const sum = await importMsarReports(prisma, parsed.data, log);
    await prisma.medSourceRun.update({
      where: { id: run.id },
      data: { status: 'OK', finishedAt: now(), stats: { hash, ...sum } },
    });
    log.info(`MSAR reports: imported ${sum.facts} facts for ${sum.schools} schools`);
    return 'imported';
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.medSourceRun
      .update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now(), error } })
      .catch(() => undefined);
    log.error(`MSAR reports: import failed: ${error}`);
    return 'failed';
  }
}
