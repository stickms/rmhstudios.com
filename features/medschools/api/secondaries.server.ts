/**
 * The Secondaries tab's data (public, user-independent) and the one place that turns stored prompts into the school
 * view. `getSchoolViews` is shared with the overlap endpoint, so a member sees exactly what the tab shows (plan D8).
 *
 * Reads are flat (prompts, then their observations): the in-memory test fake cannot evaluate nested relation filters.
 * Nothing here reads a session, a list or the tracker; the body is the same for every viewer and is cached publicly.
 */
import { prisma } from '@/lib/prisma.server';
import type {
  MedAdmissionsPolicyDto,
  MedPromptSourceId,
  MedSchoolSecondariesRes,
  MedSecondaryGroupDto,
  MedSecondaryPromptDto,
  MedSecondarySourceDto,
  MedSecondaryTurnaroundDto,
} from '../medschools.contract';
import { buildSchoolView, type ProgramView, type PromptView, type StoredPrompt } from '../engine/secondaries/view';
import { SOURCE_PRIORITY, type PromptSource } from '../engine/secondaries/types';
import { parseSummaryKey } from '../engine/sdn-title';
import { essayQuestionsUrl } from '../scrape/adapters/sdn/urls';
import { ADMIT_SECONDARY_URL } from '../scrape/sources';
import { cycleYearOf } from '../engine/cycle';
import { SCHOOL_SLUG_RE } from '../engine/school-slug';

const SAFE_PART = /^[\w.-]+$/;
const regFirst = (a: { program: string }, b: { program: string }): number =>
  a.program === b.program ? 0 : a.program === 'REG' ? -1 : 1;
const day = (d: Date): string => d.toISOString().slice(0, 10);

/** The stored prompts of these schools as the read model takes them, by school id. Two reads for any number of schools. */
export async function getSchoolViews(
  schoolIds: readonly string[],
  currentCycle: number,
): Promise<Map<string, { view: ProgramView[]; prompts: StoredPrompt[] }>> {
  const out = new Map<string, { view: ProgramView[]; prompts: StoredPrompt[] }>();
  if (schoolIds.length === 0) return out;
  const prompts = await prisma.medSecondaryPrompt.findMany({
    where: { schoolId: { in: [...schoolIds] } },
    select: { id: true, schoolId: true, program: true, text: true, themes: true },
  });
  const observations =
    prompts.length === 0
      ? []
      : await prisma.medSecondaryObservation.findMany({
          where: { promptId: { in: prompts.map((p) => p.id) } },
          select: {
            promptId: true,
            cycleYear: true,
            source: true,
            limitKind: true,
            limitValue: true,
            optional: true,
            sourceRef: true,
            lastCheckedAt: true,
          },
        });
  // Which sources' pages were read this cycle, per school: only those can say a prompt is gone.
  const cycleStart = new Date(Date.UTC(currentCycle - 1, 5, 1));
  const checks = await prisma.medSecondaryCheck.findMany({
    where: { schoolId: { in: [...schoolIds] }, status: 'OK', checkedAt: { gte: cycleStart } },
    select: { schoolId: true, source: true },
  });
  const readBy = new Map<string, Set<PromptSource>>();
  for (const c of checks) {
    const set = readBy.get(c.schoolId) ?? new Set<PromptSource>();
    set.add(c.source);
    readBy.set(c.schoolId, set);
  }
  const obsBy = new Map<string, StoredPrompt['observations']>();
  for (const o of observations) {
    const list = obsBy.get(o.promptId) ?? [];
    list.push({
      cycleYear: o.cycleYear,
      source: o.source,
      limit: o.limitKind && o.limitValue ? { kind: o.limitKind, value: o.limitValue } : null,
      optional: o.optional,
      sourceRef: o.sourceRef,
      lastCheckedAt: o.lastCheckedAt,
    });
    obsBy.set(o.promptId, list);
  }
  const bySchool = new Map<string, StoredPrompt[]>();
  for (const p of prompts) {
    const list = bySchool.get(p.schoolId) ?? [];
    list.push({ id: p.id, program: p.program, text: p.text, themes: p.themes, observations: obsBy.get(p.id) ?? [] });
    bySchool.set(p.schoolId, list);
  }
  for (const id of schoolIds) {
    const stored = bySchool.get(id) ?? [];
    out.set(id, { view: buildSchoolView(stored, currentCycle, { readSources: readBy.get(id) ?? new Set() }), prompts: stored });
  }
  return out;
}

export function promptDto(p: PromptView): MedSecondaryPromptDto {
  return {
    id: p.id,
    text: p.text,
    limit: p.limit ? { kind: p.limit.kind, value: p.limit.value } : null,
    optional: p.optional,
    themes: [...p.themes],
    status: p.status,
    previousText: p.previousText,
    cycles: [...p.cycles],
    sources: [...p.sources],
    lastCheckedAt: p.lastCheckedAt.toISOString(),
  };
}

function groupDto(v: ProgramView): MedSecondaryGroupDto[] {
  if (v.state === 'none' || v.shownCycle === null) return [];
  return [
    {
      program: v.program,
      state: v.state,
      shownCycle: v.shownCycle,
      comparedWith: v.comparedWith,
      prompts: v.prompts.map(promptDto),
    },
  ];
}

export async function getSchoolSecondaries(
  slug: string,
  q: { program?: 'ALL' | 'REG' | 'PHD' | undefined },
  now: Date = new Date(),
): Promise<MedSchoolSecondariesRes | null> {
  if (!SCHOOL_SLUG_RE.test(slug)) return null;
  const school = await prisma.medSchool.findFirst({ where: { slug, active: true }, select: { id: true } });
  if (!school) return null;
  // The prompts are stored under the secondary cycle (it rolls over on June 1); the site cycle follows interviews and
  // would show last cycle's prompts all summer, with this cycle's new ones in no tab.
  const cycleYear = cycleYearOf(now, 'SECONDARY');
  const wanted = q.program === 'REG' ? ['REG'] : q.program === 'PHD' ? ['PHD'] : ['REG', 'PHD'];

  const [views, checks, aliases, policies, turnarounds] = await Promise.all([
    getSchoolViews([school.id], cycleYear),
    prisma.medSecondaryCheck.findMany({
      where: { schoolId: school.id },
      select: { source: true, checkedAt: true, status: true },
    }),
    prisma.medSchoolAlias.findMany({
      where: { schoolId: school.id, source: { in: ['ADMIT', 'SDN'] } },
      select: { source: true, sourceKey: true },
    }),
    prisma.medSchoolAdmissionsPolicy.findMany({
      where: { schoolId: school.id },
      select: { program: true, rolling: true, evidence: true, url: true, checkedOn: true },
    }),
    prisma.medSecondaryTurnaround.findMany({
      where: { schoolId: school.id },
      select: { program: true, members: true, p25Days: true, medianDays: true, p75Days: true, asOf: true },
    }),
  ]);
  const mine = views.get(school.id) ?? { view: [], prompts: [] };

  // School-level attribution: one line per source that has been read, with the page it was read on where one is known.
  const admitKey = aliases.find((a) => a.source === 'ADMIT' && SAFE_PART.test(a.sourceKey))?.sourceKey;
  const sdnKey = aliases
    .filter((a) => a.source === 'SDN')
    .map((a) => parseSummaryKey(a.sourceKey))
    .find((k) => k !== null && SAFE_PART.test(k.code) && SAFE_PART.test(k.slug));
  const observed = mine.prompts.flatMap((p) => p.observations);
  const urlOf = (source: MedPromptSourceId): string | null => {
    if (source === 'ADMIT') return admitKey ? ADMIT_SECONDARY_URL(admitKey) : null;
    if (source === 'SDN') return sdnKey ? essayQuestionsUrl(sdnKey.code, sdnKey.slug) : null;
    // The school's own page: the newest observation's reference (an import writes its page url there).
    const newest = observed
      .filter((o) => o.source === 'SCHOOL' && o.sourceRef)
      .sort((a, b) => b.cycleYear - a.cycleYear || b.lastCheckedAt.getTime() - a.lastCheckedAt.getTime())[0];
    return newest?.sourceRef ?? null;
  };
  const sources: MedSecondarySourceDto[] = [];
  for (const source of SOURCE_PRIORITY) {
    const check = checks.find((c) => c.source === source);
    const seen = observed.filter((o) => o.source === source);
    if (!check && seen.length === 0) continue;
    const newestSeen = seen.reduce((t, o) => Math.max(t, o.lastCheckedAt.getTime()), 0);
    sources.push({
      source,
      url: urlOf(source),
      checkedAt: check ? check.checkedAt.toISOString() : new Date(newestSeen).toISOString(),
      status: check?.status ?? 'OK',
    });
  }

  const admissions: MedAdmissionsPolicyDto[] = policies
    .filter((p) => wanted.includes(p.program))
    .map((p) => ({
      program: p.program,
      rolling: p.rolling,
      evidence: p.evidence,
      url: p.url,
      checkedOn: day(p.checkedOn),
    }))
    .sort(regFirst);
  const turnaround: MedSecondaryTurnaroundDto[] = turnarounds
    .filter((t) => wanted.includes(t.program))
    .map((t) => ({
      program: t.program,
      members: t.members,
      p25Days: t.p25Days,
      medianDays: t.medianDays,
      p75Days: t.p75Days,
      asOf: day(t.asOf),
    }))
    .sort(regFirst);

  return {
    cycleYear,
    groups: mine.view.filter((v) => wanted.includes(v.program)).flatMap(groupDto),
    sources,
    admissions,
    turnaround,
  };
}
