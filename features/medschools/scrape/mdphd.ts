/**
 * The curated import of MD-PhD programs (owner 2026-11-24): `data/medschools/mdphd-programs.json` (each school's own
 * program page, read by hand; the timeline only where its words were re-fetched and found verbatim) and
 * `data/medschools/mstp-t32.json` (NIH RePORTER: the active NIGMS T32 Medical Scientist Training Program grants, matched
 * to schools by hand in `data/medschools/mstp-aliases.json`). Both are built by `scripts/medschools/build-mdphd-data.ts`
 * and checked by `scripts/medschools/check-mdphd.ts`. There is NO recurring job and no request anywhere: the import
 * reads two files.
 *
 * What it writes, all idempotent (`MedSchoolFact`, program PHD, cycleYear `MDPHD_CYCLE`):
 *  - `MDPHD_PROGRAM` for every school the program file decides (YES or NO, source SCHOOL_PAGE) and for every school
 *    known only from a grant (YES, source NIH_REPORTER, no timeline);
 *  - `MDPHD_TIMELINE` where the program file holds a verified timeline (source SCHOOL_PAGE, the quote in `note`);
 *  - `MSTP_T32` for every school whose program exists: LISTED with the grant, or NOT_LISTED with the date RePORTER was
 *    read (source NIH_REPORTER).
 * A row the files no longer produce is deleted, and only rows of these kinds and these two sources: the table equals the
 * files for what this import owns and nothing else is touched.
 */
import { z } from 'zod';
import {
  MDPHD_CYCLE,
  MDPHD_KINDS,
  MDPHD_SOURCES,
  PHASES,
  REPORTER_SEARCH_URL,
  timelineHasContent,
  normalisePattern,
  reporterProjectUrl,
  type MdPhdKind,
  type MdPhdSource,
} from '../engine/mdphd';
import type { Logger, MedPrisma } from './types';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const https = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'https only');

const phaseSchema = z
  .object({
    phase: z.enum(PHASES),
    years: z.number().positive().max(8).nullable(),
    label: z.string().min(1).max(300),
  })
  .strict();

const timelineSchema = z
  .object({
    pattern: z.string().min(3).max(40).nullable(),
    phases: z.array(phaseSchema).max(10),
    totalYears: z.number().positive().max(12).nullable(),
    evidence: z.string().min(20).max(3000),
    url: https,
    checkedOn: day,
  })
  .strict();

const programSchema = z
  .object({
    slug,
    exists: z.boolean(),
    name: z.string().min(1).max(200).nullable(),
    url: https,
    checkedOn: day,
    timeline: timelineSchema.nullable(),
  })
  .strict();

export const mdphdProgramsFileSchema = z
  .object({
    source: z.string().min(1),
    method: z.string().min(1),
    checkedOn: day,
    ownerDecisions: z.array(z.string().min(1)).min(1),
    verifier: z.string().min(1),
    schools: z.array(programSchema).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    const seen = new Set<string>();
    for (const s of f.schools) {
      if (seen.has(s.slug)) bad(`${s.slug}: listed twice`);
      seen.add(s.slug);
      if (!s.exists && s.timeline) bad(`${s.slug}: a school with no program has no timeline`);
      if (!s.exists && s.name) bad(`${s.slug}: a school with no program has no program name`);
      const t = s.timeline;
      if (!t) continue;
      if (t.pattern !== normalisePattern(t.pattern)) bad(`${s.slug}: pattern "${t.pattern}" is not normalised`);
      if (!timelineHasContent(t)) bad(`${s.slug}: a timeline is drawable or states the length`);
    }
  });

const grantSchema = z
  .object({
    slug,
    /** The core project number, e.g. T32GM145408. */
    core: z.string().regex(/^T32GM\d{6}$/),
    /** The latest award's full number, e.g. 5T32GM145408-04. */
    projectNum: z.string().regex(/^\dT32GM\d{6}-\d{2}(A\d)?(S\d)?$/),
    applId: z.number().int().positive(),
    organization: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
    fiscalYear: z.number().int().min(2020).max(2100),
    projectEnd: day,
    why: z.string().min(1).max(500).optional(),
  })
  .strict();

const excludedSchema = z
  .object({ core: z.string().regex(/^T32GM\d{6}$/), organization: z.string().min(1), reason: z.string().min(1) })
  .strict();

/** A grant for a veterinary DVM-PhD program is not an MD-PhD MSTP and never maps to a medical school. */
export const VETERINARY = /\bDVM\b|veterinar/i;

export const mstpFileSchema = z
  .object({
    source: z.string().min(1),
    sourceUrl: z.literal(REPORTER_SEARCH_URL),
    query: z.string().min(1),
    fetchedOn: day,
    method: z.string().min(1),
    grants: z.array(grantSchema).min(1),
    excluded: z.array(excludedSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    const slugs = new Set<string>();
    const cores = new Set<string>();
    for (const g of f.grants) {
      if (slugs.has(g.slug)) bad(`${g.slug}: two grants`);
      slugs.add(g.slug);
      if (cores.has(g.core)) bad(`${g.core}: listed twice`);
      cores.add(g.core);
      if (!g.projectNum.includes(g.core)) bad(`${g.core}: project number ${g.projectNum} is another project`);
      if (VETERINARY.test(g.title)) bad(`${g.core}: a veterinary DVM-PhD grant is not an MD-PhD MSTP`);
    }
    for (const x of f.excluded) if (cores.has(x.core)) bad(`${x.core}: both a grant and excluded`);
  });

export type MdPhdProgramsFile = z.infer<typeof mdphdProgramsFileSchema>;
export type MstpFile = z.infer<typeof mstpFileSchema>;

export interface MdPhdRow {
  slug: string;
  kind: MdPhdKind;
  source: MdPhdSource;
  valueText: string | null;
  valueNum: number | null;
  /** Always an object (never a JSON null, which Prisma would need a sentinel for). */
  valueJson: Record<string, unknown>;
  note: string | null;
  sourceUrl: string;
  sourceLabel: string;
  checkedOn: string;
}

/** The rows both files produce, in a stable order. A grant for a school whose page says it has no program is an error. */
export function mdphdRows(programs: MdPhdProgramsFile, mstp: MstpFile): MdPhdRow[] {
  const rows: MdPhdRow[] = [];
  const grantOf = new Map(mstp.grants.map((g) => [g.slug, g]));
  const programOf = new Map(programs.schools.map((s) => [s.slug, s]));
  for (const g of mstp.grants) {
    if (programOf.get(g.slug)?.exists === false)
      throw new Error(`${g.slug}: its page says it has no program, but it holds MSTP grant ${g.core}`);
  }
  const slugs = [...new Set([...programs.schools.map((s) => s.slug), ...mstp.grants.map((g) => g.slug)])].sort();
  for (const s of slugs) {
    const p = programOf.get(s);
    const g = grantOf.get(s);
    if (p) {
      rows.push({
        slug: s,
        kind: 'MDPHD_PROGRAM',
        source: 'SCHOOL_PAGE',
        valueText: p.exists ? 'YES' : 'NO',
        valueNum: null,
        valueJson: { name: p.name },
        note: null,
        sourceUrl: p.url,
        sourceLabel: 'School program page',
        checkedOn: p.checkedOn,
      });
      if (p.timeline) {
        const t = p.timeline;
        rows.push({
          slug: s,
          kind: 'MDPHD_TIMELINE',
          source: 'SCHOOL_PAGE',
          valueText: t.pattern,
          valueNum: t.totalYears,
          valueJson: { phases: t.phases },
          note: t.evidence,
          sourceUrl: t.url,
          sourceLabel: 'School program page',
          checkedOn: t.checkedOn,
        });
      }
    } else if (g) {
      rows.push({
        slug: s,
        kind: 'MDPHD_PROGRAM',
        source: 'NIH_REPORTER',
        valueText: 'YES',
        valueNum: null,
        valueJson: { name: null },
        note: null,
        sourceUrl: reporterProjectUrl(g.applId),
        sourceLabel: 'NIH RePORTER',
        checkedOn: mstp.fetchedOn,
      });
    }
    const exists = p ? p.exists : !!g;
    if (!exists) continue;
    rows.push(
      g
        ? {
            slug: s,
            kind: 'MSTP_T32',
            source: 'NIH_REPORTER',
            valueText: 'LISTED',
            valueNum: g.fiscalYear,
            valueJson: { grant: g.core, projectNum: g.projectNum, applId: g.applId, organization: g.organization },
            note: null,
            sourceUrl: reporterProjectUrl(g.applId),
            sourceLabel: 'NIH RePORTER',
            checkedOn: mstp.fetchedOn,
          }
        : {
            slug: s,
            kind: 'MSTP_T32',
            source: 'NIH_REPORTER',
            valueText: 'NOT_LISTED',
            valueNum: null,
            valueJson: {},
            note: null,
            sourceUrl: REPORTER_SEARCH_URL,
            sourceLabel: 'NIH RePORTER',
            checkedOn: mstp.fetchedOn,
          },
    );
  }
  return rows;
}

export interface MdPhdImportSummary {
  schools: number;
  missingSchools: string[];
  facts: number;
  removed: number;
}

const dayDate = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

export async function importMdPhd(
  prisma: MedPrisma,
  programs: MdPhdProgramsFile,
  mstp: MstpFile,
  log: Pick<Logger, 'info' | 'warn'>,
): Promise<MdPhdImportSummary> {
  const out: MdPhdImportSummary = { schools: 0, missingSchools: [], facts: 0, removed: 0 };
  const rows = mdphdRows(programs, mstp);
  const schools = await prisma.medSchool.findMany({ select: { id: true, slug: true } });
  const idOf = new Map(schools.map((s) => [s.slug, s.id]));
  const keep = new Set<string>();
  const seenSchools = new Set<string>();
  for (const r of rows) {
    const schoolId = idOf.get(r.slug);
    if (!schoolId) {
      if (!out.missingSchools.includes(r.slug)) out.missingSchools.push(r.slug);
      continue;
    }
    seenSchools.add(r.slug);
    const data = {
      program: 'PHD' as const,
      cycleYear: MDPHD_CYCLE,
      kind: r.kind,
      valueText: r.valueText,
      valueNum: r.valueNum,
      valueJson: r.valueJson,
      note: r.note,
      source: r.source,
      sourceUrl: r.sourceUrl,
      sourceLabel: r.sourceLabel,
      reportId: null,
      page: null,
      checkedOn: dayDate(r.checkedOn),
    };
    const saved = await prisma.medSchoolFact.upsert({
      where: {
        schoolId_program_cycleYear_kind_source: {
          schoolId,
          program: 'PHD',
          cycleYear: MDPHD_CYCLE,
          kind: r.kind,
          source: r.source,
        },
      },
      create: { schoolId, ...data },
      update: data,
    });
    keep.add(saved.id);
    out.facts += 1;
  }
  out.schools = seenSchools.size;
  // Only this import's kinds and sources: the AAMC and Admit rows, and any other source, are never read or removed.
  const existing = await prisma.medSchoolFact.findMany({
    where: { kind: { in: [...MDPHD_KINDS] }, source: { in: [...MDPHD_SOURCES] } },
    select: { id: true },
  });
  const stale = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (stale.length > 0 && out.missingSchools.length === 0) {
    const r = await prisma.medSchoolFact.deleteMany({ where: { id: { in: stale } } });
    out.removed = r.count;
  }
  log.info(`mdphd: schools=${out.schools} facts=${out.facts} removed=${out.removed}`);
  if (out.missingSchools.length > 0) log.warn(`mdphd: unknown slugs skipped: ${out.missingSchools.join(', ')}`);
  return out;
}

export const MDPHD_JOB = 'mdphd-import';

/** A stable fingerprint of both files: a new version of either imports again, the same pair never does. */
export function mdphdHash(programs: unknown, mstp: unknown): string {
  const text = JSON.stringify([programs, mstp]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}-${h.toString(16)}`;
}

/**
 * The worker's bootstrap step: imports both files once per version of the pair (a `MedSourceRun` with job
 * `mdphd-import`, status OK and the pair's hash is the done flag). The import is idempotent, so a failed or repeated run
 * is harmless; this only keeps it from re-reading the files on every restart.
 */
export async function ensureMdPhdImported(
  prisma: MedPrisma,
  programsRaw: unknown,
  mstpRaw: unknown,
  log: Pick<Logger, 'info' | 'warn' | 'error'>,
  now: () => Date = () => new Date(),
): Promise<'imported' | 'current' | 'invalid' | 'failed'> {
  const programs = mdphdProgramsFileSchema.safeParse(programsRaw);
  const mstp = mstpFileSchema.safeParse(mstpRaw);
  if (!programs.success || !mstp.success) {
    const n = (programs.error?.issues.length ?? 0) + (mstp.error?.issues.length ?? 0);
    log.error(`MD-PhD: data files are invalid (${n} issues); nothing imported`);
    return 'invalid';
  }
  const hash = mdphdHash(programsRaw, mstpRaw);
  const last = await prisma.medSourceRun.findFirst({
    where: { source: 'RMH', job: MDPHD_JOB, status: 'OK' },
    orderBy: { startedAt: 'desc' },
  });
  const lastHash = (last?.stats as { hash?: unknown } | null | undefined)?.hash;
  if (lastHash === hash) return 'current';
  const run = await prisma.medSourceRun.create({
    data: { source: 'RMH', job: MDPHD_JOB, trigger: 'BOOTSTRAP', status: 'RUNNING' },
  });
  try {
    const sum = await importMdPhd(prisma, programs.data, mstp.data, log);
    await prisma.medSourceRun.update({
      where: { id: run.id },
      data: { status: 'OK', finishedAt: now(), stats: { hash, ...sum } },
    });
    log.info(`MD-PhD: imported ${sum.facts} facts for ${sum.schools} schools`);
    return 'imported';
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.medSourceRun
      .update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now(), error } })
      .catch(() => undefined);
    log.error(`MD-PhD: import failed: ${error}`);
    return 'failed';
  }
}
