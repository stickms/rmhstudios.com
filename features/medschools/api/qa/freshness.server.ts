/**
 * Timestamps and the school directory for the Q&A (plan R6). "Updated" is what the page's source row says, never "now":
 * the latest successful `MedSourceRun` of a fact's source, an interview profile's `fetchedAt`, the newest question's
 * `updatedAt`, a forecast's `computedAt`. These are non-person columns; no count and no tracker row is read here.
 */
import { cached } from '@/lib/cached.server';
import { prisma } from '@/lib/prisma.server';
import type { SchoolDirEntry } from '../../engine/qa/route';
import type { Stamps } from '../../engine/qa/facts';

const DIRECTORY_TTL_MS = 5 * 60_000;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/**
 * Counts are stamped per SOURCE, not per school (a run refreshes a whole source), so a citation reads "source
 * refreshed". The latest OK run per source; a RUNNING, PARTIAL or FAILED run does not count.
 */
export async function stampsFor(slug: string): Promise<Stamps> {
  const [runs, profiles, question, forecast] = await Promise.all([
    prisma.medSourceRun.findMany({
      where: { status: 'OK', finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      distinct: ['source'],
      select: { source: true, finishedAt: true },
    }),
    prisma.medInterviewProfile.findMany({
      where: { school: { slug } },
      select: { source: true, fetchedAt: true },
    }),
    prisma.medInterviewQuestion.findFirst({
      where: { school: { slug } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    prisma.medForecast.findFirst({
      where: { school: { slug } },
      orderBy: { computedAt: 'desc' },
      select: { computedAt: true },
    }),
  ]);
  const counts: Stamps['counts'] = {};
  for (const r of runs) counts[r.source] = iso(r.finishedAt);
  const profile: Stamps['profile'] = {};
  for (const p of profiles) profile[p.source] = iso(p.fetchedAt);
  return { counts, profile, questions: iso(question?.updatedAt), forecast: iso(forecast?.computedAt) };
}

/** Active schools, public header columns only; the route call's names are resolved against it. */
export function schoolDirectory(): Promise<SchoolDirEntry[]> {
  return cached(
    'medschools:qa:directory',
    DIRECTORY_TTL_MS,
    async () => {
      const rows = await prisma.medSchool.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { slug: true, name: true, shortName: true, state: true, interviewFormat: true },
      });
      return rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        shortName: r.shortName,
        state: r.state,
        interviewFormat: r.interviewFormat,
      }));
    },
    { l2: false },
  );
}
