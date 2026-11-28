/**
 * The curated import of entering-class statistics (phase C step 2): `data/medschools/class-profiles.json`, each
 * school's OWN class-profile page or PDF, read once by hand with the site's static contact user agent, and every figure's
 * evidence re-fetched and found verbatim on its url. There is NO recurring job and no request anywhere: the import reads
 * a file. `scripts/medschools/check-class-profiles.ts` re-checks the pages by hand.
 *
 * What it writes, all idempotent (`MedSchoolFact`, source `SCHOOL_PROFILE`):
 *  - one row per stated figure: kind `PROFILE_<KIND>` (`PROFILE_<KIND>#n` for the n-th of a kind in one class and
 *    program), program `REG` unless the qualifier says the figure is for the MD-PhD (DO-PhD, MSTP) program only
 *    (`PHD`), `cycleYear` the entering year or `PROFILE_UNDATED_CYCLE` (0) for a class the page does not date;
 *  - `valueText` the page's string, `valueNum` only where it is a plain number, `valueJson`
 *    `{ text, label, qualifier, evidence, url, unit, order }`, `note` the evidence, `sourceUrl` the page.
 * A row the file no longer produces is deleted, and only rows of this source: the AAMC, Admit, school-page and RePORTER
 * rows are never read or removed. Nothing is removed while a slug is unknown to the registry.
 */
import { z } from 'zod';
import { SCHOOL_SLUG_RE } from '../engine/school-slug';
import {
  PROFILE_KIND_IDS,
  PROFILE_OLDEST_CLASS,
  PROFILE_UNDATED_CYCLE,
  evidenceHasValue,
  isPhdOnlyQualifier,
  parseProfileNumber,
  profileStoredKind,
  type ProfileKindId,
} from '../engine/school-facts';
import { isThirdPartyHost } from './school-pages';
import type { Logger, MedPrisma } from './types';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Sites that publish other people's class statistics and are never a source here, beyond the school-pages list (which
 * already refuses AAMC, AACOM, Admit, SDN, CycleTrack, forums and Wikipedia): rankings, the AACOMAS / Choose DO pages
 * and prep companies.
 */
const PROFILE_THIRD_PARTY_HOSTS = [
  'usnews.com',
  'choosedo.org',
  'liaisoncas.com',
  'princetonreview.com',
  'kaptest.com',
  'blueprintprep.com',
  'bemo.com',
  'mappd.com',
];
const isProfileThirdParty = (host: string): boolean => {
  const h = host.toLowerCase().replace(/\.$/, '');
  return isThirdPartyHost(h) || PROFILE_THIRD_PARTY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
};

/** An https page on the school's own host: a third-party site (MSAR, Admit, US News, forums...) is refused. */
const schoolUrl = z
  .string()
  .max(500)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (
        url.protocol === 'https:' && url.username === '' && url.password === '' && !isProfileThirdParty(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'must be an https URL on a school-owned host');

const statSchema = z
  .object({
    kind: z.enum(PROFILE_KIND_IDS as [ProfileKindId, ...ProfileKindId[]]),
    value: z.string().trim().min(1).max(80),
    unit: z.string().min(1).max(40).nullable(),
    qualifier: z.string().min(1).max(200).nullable(),
    evidence: z.string().min(3).max(600),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.kind === 'OTHER' && !s.qualifier)
      ctx.addIssue({ code: 'custom', message: 'an OTHER figure names itself in its qualifier' });
    if (!evidenceHasValue(s.value, s.evidence))
      ctx.addIssue({ code: 'custom', message: `the evidence does not carry the value "${s.value}"` });
  });

const classSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    enteringYear: z.number().int().min(PROFILE_OLDEST_CLASS).max(2100).nullable(),
    url: schoolUrl,
    stats: z.array(statSchema).min(1).max(40),
  })
  .strict();

const schoolSchema = z
  .object({
    slug: z.string().regex(SCHOOL_SLUG_RE),
    checkedOn: day,
    classes: z.array(classSchema).min(1).max(6),
  })
  .strict()
  .superRefine((s, ctx) => {
    // The class is the cycle in the unique key: two classes of one year (or two undated) would overwrite each other.
    const years = s.classes.map((c) => c.enteringYear ?? PROFILE_UNDATED_CYCLE);
    if (new Set(years).size !== years.length)
      ctx.addIssue({ code: 'custom', message: `${s.slug}: two classes share an entering year (or are both undated)` });
  });

export const classProfilesFileSchema = z
  .object({
    source: z.string().min(1),
    method: z.string().min(1),
    checkedOn: day,
    rules: z.array(z.string().min(1)).min(1),
    verifier: z.string().min(1),
    schools: z.array(schoolSchema).min(1),
  })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    for (const s of f.schools) {
      if (seen.has(s.slug)) ctx.addIssue({ code: 'custom', message: `${s.slug}: listed twice` });
      seen.add(s.slug);
    }
  });

export type ClassProfilesFile = z.infer<typeof classProfilesFileSchema>;

export interface ClassProfileRow {
  slug: string;
  program: 'REG' | 'PHD';
  cycleYear: number;
  kind: string;
  valueText: string;
  valueNum: number | null;
  valueJson: {
    text: string;
    label: string;
    qualifier: string | null;
    evidence: string;
    url: string;
    unit: string | null;
    /** The figure's place in its class on the page, so the read keeps the page's order. */
    order: number;
  };
  note: string;
  sourceUrl: string;
  sourceLabel: string;
  checkedOn: string;
}

export const CLASS_PROFILE_SOURCE_LABEL = 'School class profile';

/** The rows the file produces, in the file's order. Pure. */
export function classProfileRows(file: ClassProfilesFile): ClassProfileRow[] {
  const rows: ClassProfileRow[] = [];
  for (const s of file.schools) {
    for (const c of s.classes) {
      const ordinal = new Map<string, number>();
      c.stats.forEach((st, order) => {
        const program = isPhdOnlyQualifier(st.qualifier) ? 'PHD' : 'REG';
        const key = `${program}:${st.kind}`;
        const n = (ordinal.get(key) ?? 0) + 1;
        ordinal.set(key, n);
        rows.push({
          slug: s.slug,
          program,
          cycleYear: c.enteringYear ?? PROFILE_UNDATED_CYCLE,
          kind: profileStoredKind(st.kind, n),
          valueText: st.value,
          valueNum: parseProfileNumber(st.kind, st.value),
          valueJson: {
            text: st.value,
            label: c.label,
            qualifier: st.qualifier,
            evidence: st.evidence,
            url: c.url,
            unit: st.unit,
            order,
          },
          note: st.evidence,
          sourceUrl: c.url,
          sourceLabel: CLASS_PROFILE_SOURCE_LABEL,
          checkedOn: s.checkedOn,
        });
      });
    }
  }
  return rows;
}

export interface ClassProfilesImportSummary {
  schools: number;
  missingSchools: string[];
  facts: number;
  removed: number;
}

const dayDate = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

export async function importClassProfiles(
  prisma: MedPrisma,
  file: ClassProfilesFile,
  log: Pick<Logger, 'info' | 'warn'>,
): Promise<ClassProfilesImportSummary> {
  const out: ClassProfilesImportSummary = { schools: 0, missingSchools: [], facts: 0, removed: 0 };
  const schools = await prisma.medSchool.findMany({ select: { id: true, slug: true } });
  const idOf = new Map(schools.map((s) => [s.slug, s.id]));
  const keep = new Set<string>();
  const seenSchools = new Set<string>();
  for (const r of classProfileRows(file)) {
    const schoolId = idOf.get(r.slug);
    if (!schoolId) {
      if (!out.missingSchools.includes(r.slug)) out.missingSchools.push(r.slug);
      continue;
    }
    seenSchools.add(r.slug);
    const data = {
      program: r.program,
      cycleYear: r.cycleYear,
      kind: r.kind,
      valueText: r.valueText,
      valueNum: r.valueNum,
      valueJson: r.valueJson,
      note: r.note,
      source: 'SCHOOL_PROFILE' as const,
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
          program: r.program,
          cycleYear: r.cycleYear,
          kind: r.kind,
          source: 'SCHOOL_PROFILE',
        },
      },
      create: { schoolId, ...data },
      update: data,
    });
    keep.add(saved.id);
    out.facts += 1;
  }
  out.schools = seenSchools.size;
  // Only this import's source: every other source's rows are never read or removed.
  const existing = await prisma.medSchoolFact.findMany({ where: { source: 'SCHOOL_PROFILE' }, select: { id: true } });
  const stale = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (stale.length > 0 && out.missingSchools.length === 0) {
    const r = await prisma.medSchoolFact.deleteMany({ where: { id: { in: stale } } });
    out.removed = r.count;
  }
  log.info(`class-profiles: schools=${out.schools} facts=${out.facts} removed=${out.removed}`);
  if (out.missingSchools.length > 0)
    log.warn(`class-profiles: unknown slugs skipped: ${out.missingSchools.join(', ')}`);
  return out;
}

export const CLASS_PROFILES_JOB = 'class-profiles-import';

/** A stable fingerprint of the file: a new version imports again, the same one never does. */
export function classProfilesHash(raw: unknown): string {
  const text = JSON.stringify(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}-${h.toString(16)}`;
}

/**
 * The worker's bootstrap step: imports the file once per version (a `MedSourceRun` with job `class-profiles-import`,
 * status OK and the file's hash is the done flag). The import is idempotent, so a failed or repeated run is harmless.
 */
export async function ensureClassProfilesImported(
  prisma: MedPrisma,
  raw: unknown,
  log: Pick<Logger, 'info' | 'warn' | 'error'>,
  now: () => Date = () => new Date(),
): Promise<'imported' | 'current' | 'invalid' | 'failed'> {
  const parsed = classProfilesFileSchema.safeParse(raw);
  if (!parsed.success) {
    log.error(`Class profiles: data file is invalid (${parsed.error.issues.length} issues); nothing imported`);
    return 'invalid';
  }
  const hash = classProfilesHash(raw);
  const last = await prisma.medSourceRun.findFirst({
    where: { source: 'RMH', job: CLASS_PROFILES_JOB, status: 'OK' },
    orderBy: { startedAt: 'desc' },
  });
  const lastHash = (last?.stats as { hash?: unknown } | null | undefined)?.hash;
  if (lastHash === hash) return 'current';
  const run = await prisma.medSourceRun.create({
    data: { source: 'RMH', job: CLASS_PROFILES_JOB, trigger: 'BOOTSTRAP', status: 'RUNNING' },
  });
  try {
    const sum = await importClassProfiles(prisma, parsed.data, log);
    await prisma.medSourceRun.update({
      where: { id: run.id },
      data: { status: 'OK', finishedAt: now(), stats: { hash, ...sum } },
    });
    log.info(`Class profiles: imported ${sum.facts} facts for ${sum.schools} schools`);
    return 'imported';
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.medSourceRun
      .update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now(), error } })
      .catch(() => undefined);
    log.error(`Class profiles: import failed: ${error}`);
    return 'failed';
  }
}
