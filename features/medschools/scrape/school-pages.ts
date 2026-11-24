/**
 * The one-time curated school-page import (owner 2026-11-23, answer 2). Each school's own secondary-application page and
 * admissions page were read by hand once and checked in as `data/medschools/school-pages.json`; this module validates
 * that file and loads it. There is NO recurring job and no fetch of a school's website anywhere: the import reads a file.
 *
 * What it writes, all idempotent (a rerun changes nothing but `lastCheckedAt`, which is the file's own check date):
 *  - `MedSecondaryPrompt` / `MedSecondaryObservation` rows with `source = SCHOOL` and `sourceRef` = the page url, through
 *    `recordPrompts`, so the same dedupe, key and display-priority rules apply as for Admit and SDN.
 *  - one `MedSecondaryCheck` per school (SCHOOL): OK with the prompt count, or EMPTY ("checked, nothing found").
 *  - one `MedSchoolAdmissionsPolicy` per school x program where the page said whether decisions are rolling.
 *
 * A prompt whose page names no cycle (`cycleYear` null) is recorded in the cycle that was in progress on the day the page
 * was read (`cycleYearOf(checkedOn, 'SECONDARY')`). The observation then says exactly what is true: this prompt was on the
 * school's page during that cycle. Skipping them would drop a school's only data on an assumption that the page was stale,
 * and the file's own method (read on the check date) does not say that.
 */
import { z } from 'zod';
import { cycleYearOf } from '../engine/cycle';
import type { NormalizedPrompt } from '../engine/secondaries/types';
import { recordCheck, recordPrompts, sanitizeSourceRef } from './secondaries-store';
import type { Logger, MedPrisma } from './types';

/** Sites that are NOT a school's own page: a secondary page here would break the "official page" claim. */
const THIRD_PARTY_HOSTS = [
  'admit.org',
  'studentdoctor.net',
  'cycletrack.org',
  'cycletrack.com',
  'mdapplicants.com',
  'reddit.com',
  'facebook.com',
  'youtube.com',
  'wikipedia.org',
  'aamc.org',
  'aacom.org',
  'google.com',
  'prospectivedoctor.com',
  'shemmassian.com',
  'medschoolcoach.com',
  'wikidoc.org',
  'archive.org',
];

/** True for a host that is a known third-party site (the host or any subdomain of it) or not a DNS name. */
export function isThirdPartyHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes('.') || /^[\d.]+$/.test(h)) return true;
  return THIRD_PARTY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

const officialUrl = z
  .string()
  .max(500)
  .refine((u) => {
    try {
      const url = new URL(u);
      return url.protocol === 'https:' && url.username === '' && url.password === '' && !isThirdPartyHost(url.hostname);
    } catch {
      return false;
    }
  }, 'must be an https URL on a school-owned host');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const program = z.enum(['REG', 'PHD']);

const promptSchema = z
  .object({
    program,
    // Longer than the store's MAX_TEXT on purpose: the store rejects an over-long text and the summary counts it.
    text: z.string().min(1).max(10000),
    limitKind: z.enum(['WORDS', 'CHARS']).nullable(),
    limitValue: z.number().int().min(1).max(20000).nullable(),
    // null = the page does not say; stored as not optional.
    optional: z.boolean().nullable(),
  })
  .strict()
  .refine((p) => (p.limitKind === null) === (p.limitValue === null), 'a limit needs a kind and a value');

const rolling = z.object({ REG: z.boolean().nullable(), PHD: z.boolean().nullable() }).strict();
const evidence = z
  .object({ REG: z.string().min(1).max(2000).nullable(), PHD: z.string().min(1).max(2000).nullable() })
  .strict();

const schoolSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    checkedOn: day,
    secondary: z
      .object({
        url: officialUrl.nullable(),
        cycleYear: z.number().int().min(2005).max(2100).nullable(),
        prompts: z.array(promptSchema).max(80),
      })
      .strict(),
    admissions: z.object({ url: officialUrl.nullable(), rolling, evidence }).strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.secondary.prompts.length > 0 && s.secondary.url === null)
      ctx.addIssue({ code: 'custom', message: 'prompts need the page url they were read on' });
    for (const p of ['REG', 'PHD'] as const) {
      const r = s.admissions.rolling[p];
      const e = s.admissions.evidence[p];
      if ((r === null) !== (e === null))
        ctx.addIssue({ code: 'custom', message: `${p}: rolling and evidence go together` });
      if (r !== null && s.admissions.url === null)
        ctx.addIssue({ code: 'custom', message: `${p}: a rolling fact needs the admissions page url` });
    }
  });

export const schoolPagesFileSchema = z
  .object({
    source: z.string().min(1),
    method: z.string().min(1),
    checkedOn: day,
    schools: z.array(schoolSchema).min(1),
  })
  .strict();

export type SchoolPagesFile = z.infer<typeof schoolPagesFileSchema>;
export type SchoolPageEntry = SchoolPagesFile['schools'][number];

export interface ImportSummary {
  schools: number;
  missingSchools: string[];
  prompts: number;
  created: number;
  rejected: number;
  checks: number;
  policies: number;
}

const dayDate = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

/** The prompts of one entry as the store takes them. */
export function promptsOf(entry: SchoolPageEntry): NormalizedPrompt[] {
  const url = entry.secondary.url;
  if (!url) return [];
  const cycleYear = entry.secondary.cycleYear ?? cycleYearOf(dayDate(entry.checkedOn), 'SECONDARY');
  return entry.secondary.prompts.map((p) => ({
    cycleYear,
    program: p.program,
    text: p.text,
    limit: p.limitKind && p.limitValue ? { kind: p.limitKind, value: p.limitValue } : null,
    optional: p.optional === true,
    sourceRef: sanitizeSourceRef(url),
  }));
}

export async function importSchoolPages(
  prisma: MedPrisma,
  file: SchoolPagesFile,
  log: Pick<Logger, 'info' | 'warn'>,
): Promise<ImportSummary> {
  const out: ImportSummary = {
    schools: 0,
    missingSchools: [],
    prompts: 0,
    created: 0,
    rejected: 0,
    checks: 0,
    policies: 0,
  };
  const schools = await prisma.medSchool.findMany({ select: { id: true, slug: true } });
  const idOf = new Map(schools.map((s) => [s.slug, s.id]));

  for (const entry of file.schools) {
    const schoolId = idOf.get(entry.slug);
    if (!schoolId) {
      out.missingSchools.push(entry.slug);
      continue;
    }
    out.schools += 1;
    // Times are the day the page was read, not the day the import ran: "checked <date>" must stay true on a rerun.
    const now = dayDate(entry.checkedOn);
    const prompts = promptsOf(entry);
    if (prompts.length > 0) {
      const siteCycle = Math.max(...prompts.map((p) => p.cycleYear));
      const r = await recordPrompts(prisma, { schoolId, source: 'SCHOOL', now, prompts, siteCycle });
      out.prompts += r.prompts;
      out.created += r.created;
      out.rejected += r.rejected;
    }
    await recordCheck(prisma, {
      schoolId,
      source: 'SCHOOL',
      now,
      status: prompts.length > 0 ? 'OK' : 'EMPTY',
      promptCount: prompts.length,
    });
    out.checks += 1;

    for (const p of ['REG', 'PHD'] as const) {
      const rolling = entry.admissions.rolling[p];
      const ev = entry.admissions.evidence[p];
      const url = entry.admissions.url;
      if (rolling === null || ev === null || url === null) continue;
      const data = { rolling, evidence: ev, url, checkedOn: now, source: 'SCHOOL' as const };
      // A policy checked or corrected after the file's day is newer than the file: leave it.
      const [current] = await prisma.medSchoolAdmissionsPolicy.findMany({ where: { schoolId, program: p } });
      if (current && current.checkedOn.getTime() > now.getTime()) continue;
      await prisma.medSchoolAdmissionsPolicy.upsert({
        where: { schoolId_program: { schoolId, program: p } },
        create: { schoolId, program: p, ...data },
        update: data,
      });
      out.policies += 1;
    }
  }
  log.info(
    `school-pages: schools=${out.schools} prompts=${out.prompts} created=${out.created} rejected=${out.rejected} checks=${out.checks} policies=${out.policies}`,
  );
  if (out.missingSchools.length > 0) log.warn(`school-pages: unknown slugs skipped: ${out.missingSchools.join(', ')}`);
  return out;
}
