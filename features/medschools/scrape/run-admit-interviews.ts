/**
 * The `medschools.interviews` job: once a day, Admit's school stats (three residence filters), then each
 * school's interview profile and question list (spec §4a).
 *
 * Stats are Admit's CUMULATIVE snapshot over all reported cycles (the query takes no year and rows carry none;
 * FINDINGS d). They are stored under the cycle current at fetch time and overwritten daily, so a reader must
 * label them "Admit.org, all reported cycles". Percentages keep the published 0-1 scale and interview
 * difficulty the published 1.5-6.89 range; neither is rescaled. Stats, profiles and questions carry
 * `program = null` (program not reported). `contributors` is the published admitted count the medians rest
 * on, so the read-time k>=3 floor applies to the in-state/out-of-state splits.
 *
 * Never throws. Raw Admit question ids never leave the client (only the keyed hash), and nothing user-shaped
 * is read, stored or logged.
 */
import { cycleYearOf } from '../engine/cycle';
import type { MedResidence } from '../engine/types';
import {
  createAdmitClient,
  type NormalizedAdmitStats,
} from './adapters/admit';
import {
  SourceHaltedError,
  type PoliteHost,
} from './http';
import {
  brief,
  closeStaleRuns,
  recordAliasMiss,
} from './run-support';
import type {
  Logger,
  MedPrisma,
} from './types';

export interface AdmitInterviewsDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
}

export interface AdmitInterviewsSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  /** Stats rows created or changed (an unchanged row costs no write). */
  statsRows: number;
  /** Stats rows skipped for an unrecognised or mismatched `residence_type`. */
  statsSkipped: number;
  schoolsFetched: number;
  schoolsSkipped: number;
  schoolsFailed: number;
  questionsCreated: number;
  questionsUpdated: number;
  questionsDeleted: number;
  misses: number;
  requests: number;
  durationMs: number;
}

const FILTERS: MedResidence[] = ['GLOBAL', 'IN_STATE', 'OUT_OF_STATE'];
/** The published lowercase `residence_type`, mapped explicitly; anything else is skipped and counted. */
const RESIDENCE_BY_TYPE: Record<string, MedResidence> = {
  global: 'GLOBAL',
  in_state: 'IN_STATE',
  out_of_state: 'OUT_OF_STATE',
};
const FRESH_MS = 6 * 86_400_000;

type Row = Record<string, unknown>;

export async function runAdmitInterviews(
  deps: AdmitInterviewsDeps,
  opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
): Promise<AdmitInterviewsSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const t0 = now().getTime();
  const summary: AdmitInterviewsSummary = {
    runId: '',
    status: 'FAILED',
    statsRows: 0,
    statsSkipped: 0,
    schoolsFetched: 0,
    schoolsSkipped: 0,
    schoolsFailed: 0,
    questionsCreated: 0,
    questionsUpdated: 0,
    questionsDeleted: 0,
    misses: 0,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): AdmitInterviewsSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  if (deps.secret.length < 16) {
    log.error('interviews: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped');
    return finish();
  }

  await closeStaleRuns(prisma, 'ADMIT', 'interviews', now, log);

  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'ADMIT', job: 'interviews', trigger: opts.trigger, status: 'RUNNING' },
    });
  } catch (e) {
    log.error(`interviews: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session();
  const client = createAdmitClient(session, { secret: deps.secret, now });
  let error: string | null = null;
  let incomplete = false;

  try {
    const aliases = await prisma.medSchoolAlias.findMany({ where: { source: 'ADMIT' } });
    const active = new Set(
      (await prisma.medSchool.findMany({ where: { active: true } })).map((s) => s.id),
    );
    const schoolBySlug = new Map(aliases.map((a) => [a.sourceKey, a.schoolId]));
    const missed = new Set<string>();
    /** Known active school for a slug; an unknown slug is one miss per slug per run (D8). */
    const resolve = async (slug: string): Promise<string | null> => {
      const schoolId = schoolBySlug.get(slug);
      if (schoolId === undefined) {
        if (!missed.has(slug)) {
          missed.add(slug);
          if (await recordAliasMiss(prisma, 'ADMIT', slug, now)) summary.misses++;
        }
        return null;
      }
      return active.has(schoolId) ? schoolId : null;
    };
    const stopped = () => deps.shouldStop() || session.halted;

    // Phase 1: school stats.
    const cycleYear = cycleYearOf(now(), 'INTERVIEW');
    for (const filter of FILTERS) {
      if (stopped()) {
        incomplete = true;
        break;
      }
      let rows: NormalizedAdmitStats[];
      try {
        rows = await client.fetchSchoolStats(filter);
      } catch (e) {
        incomplete = true;
        if (e instanceof SourceHaltedError) break;
        log.warn(`interviews: stats ${filter} failed: ${brief(e)}`);
        continue;
      }
      const seen = new Set<string>();
      for (const r of rows) {
        const mapped = r.residenceType === null ? undefined : RESIDENCE_BY_TYPE[r.residenceType];
        if (mapped === undefined || mapped !== r.residence) {
          summary.statsSkipped++;
          continue;
        }
        const schoolId = await resolve(r.schoolKey);
        if (schoolId === null || seen.has(schoolId)) continue;
        seen.add(schoolId);
        if (await writeStats(prisma, schoolId, cycleYear, now(), r)) summary.statsRows++;
      }
    }

    // Phase 2: interview profiles and questions, ordered by slug.
    if (!stopped()) {
      let listed: Awaited<ReturnType<typeof client.listInterviewSchools>>;
      try {
        listed = await client.listInterviewSchools();
      } catch (e) {
        incomplete = true;
        listed = [];
        if (!(e instanceof SourceHaltedError)) log.warn(`interviews: school list failed: ${brief(e)}`);
      }
      const targets: Array<{ slug: string; schoolId: string; interviewCount: number; total: number }> = [];
      const picked = new Set<string>();
      for (const s of [...listed].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))) {
        const schoolId = await resolve(s.slug);
        if (schoolId === null || picked.has(schoolId)) continue;
        picked.add(schoolId);
        targets.push({ slug: s.slug, schoolId, interviewCount: s.interviewCount, total: s.totalInterviewCount });
      }
      for (const t of targets) {
        if (stopped()) {
          incomplete = true;
          break;
        }
        if (t.total === 0) {
          summary.schoolsSkipped++;
          continue;
        }
        try {
          const stored = await prisma.medInterviewProfile.findFirst({
            where: { schoolId: t.schoolId, source: 'ADMIT' },
          });
          if (
            stored &&
            stored.interviewCount === t.interviewCount &&
            now().getTime() - stored.fetchedAt.getTime() < FRESH_MS
          ) {
            summary.schoolsSkipped++;
            continue;
          }
          // Everything is fetched before anything is written, so a failed fetch leaves the school untouched
          // (and, being unstored, it is retried next run).
          const profile = await client.fetchInterviewProfile(t.slug);
          const questions = await client.fetchQuestions(t.slug);
          const fields = {
            format: profile.format,
            fileType: profile.fileType,
            avgDifficulty: profile.avgDifficulty,
            interviewCount: profile.interviewCount,
            feedbackPositive: profile.positive,
            feedbackNegative: profile.negative,
            feedbackBefore: profile.before,
            fetchedAt: now(),
          };
          await prisma.medInterviewProfile.upsert({
            where: { schoolId_source: { schoolId: t.schoolId, source: 'ADMIT' } },
            create: { schoolId: t.schoolId, source: 'ADMIT', ...fields },
            update: fields,
          });
          const existing = await prisma.medInterviewQuestion.findMany({
            where: { schoolId: t.schoolId, source: 'ADMIT' },
          });
          const byHash = new Map(existing.map((q) => [q.dedupeHash, q]));
          const fresh = new Set(questions.map((q) => q.dedupeHash));
          const toCreate = questions.filter((q) => !byHash.has(q.dedupeHash));
          if (toCreate.length > 0) {
            const res = await prisma.medInterviewQuestion.createMany({
              data: toCreate.map((q) => ({
                schoolId: t.schoolId,
                text: q.text,
                source: 'ADMIT',
                votes: q.votes,
                cycleYear: null,
                dedupeHash: q.dedupeHash,
              })),
              skipDuplicates: true,
            });
            summary.questionsCreated += res.count;
          }
          for (const q of questions) {
            const prior = byHash.get(q.dedupeHash);
            if (prior && prior.votes !== q.votes) {
              await prisma.medInterviewQuestion.update({ where: { id: prior.id }, data: { votes: q.votes } });
              summary.questionsUpdated++;
            }
          }
          const gone = existing.filter((q) => !fresh.has(q.dedupeHash)).map((q) => q.id);
          if (gone.length > 0) {
            const res = await prisma.medInterviewQuestion.deleteMany({ where: { id: { in: gone } } });
            summary.questionsDeleted += res.count;
          }
          summary.schoolsFetched++;
        } catch (e) {
          incomplete = true;
          if (e instanceof SourceHaltedError) break;
          summary.schoolsFailed++;
          log.warn(`interviews: ${t.slug} failed: ${brief(e)}`);
        }
      }
    } else incomplete = true;

    if (session.halted) {
      incomplete = true;
      error = brief(session.lastFailure ?? 'source halted');
    }
  } catch (e) {
    error = brief(e);
    log.error(`interviews: run failed: ${error}`);
    return await close('FAILED');
  }
  return await close(incomplete ? 'PARTIAL' : 'OK');

  async function close(status: AdmitInterviewsSummary['status']): Promise<AdmitInterviewsSummary> {
    summary.status = status;
    summary.requests = session.requests;
    finish();
    const { runId: _id, status: _s, ...counters } = summary;
    try {
      await prisma.medSourceRun.update({
        where: { id: run.id },
        data: { status, finishedAt: now(), stats: counters, error },
      });
    } catch (e) {
      log.error(`interviews: could not close run: ${brief(e)}`);
    }
    log.info(
      `interviews: ${status} stats=${summary.statsRows} schools=${summary.schoolsFetched} skipped=${summary.schoolsSkipped} failed=${summary.schoolsFailed} questions=+${summary.questionsCreated}/~${summary.questionsUpdated}/-${summary.questionsDeleted}`,
    );
    return finish();
  }
}

/**
 * Write one Admit stats row by findFirst + create/update (P15: `program` is NULL, which defeats the unique
 * key). An unchanged row is not written. Returns true when something was written.
 */
async function writeStats(
  prisma: MedPrisma,
  schoolId: string,
  cycleYear: number,
  at: Date,
  r: NormalizedAdmitStats,
): Promise<boolean> {
  const figures: Row = {
    gpaMedian: r.gpaMedian,
    mcatMedian: r.mcatMedian,
    interviewToAcceptancePct: r.interviewToAdmittedPct,
    applicationToInterviewPct: r.applicationToInterviewPct,
    applicationCount: r.applicationCount,
    interviewCount: r.interviewCount,
    admittedCount: r.admittedCount,
    // The published count the medians rest on (admitted applicants); null when absent.
    contributors: r.admittedCount,
    researchHours: r.researchHours,
    clinicalHours: r.clinicalHours,
    nonClinicalHours: r.nonClinicalHours,
  };
  const where = { schoolId, source: 'ADMIT', residence: r.residence, program: null, cycleYear };
  const prior = (await prisma.medSchoolStats.findFirst({ where })) as unknown as Row | null;
  if (!prior) {
    await prisma.medSchoolStats.create({ data: { ...where, ...figures, sourceUpdatedAt: at } });
    return true;
  }
  if (Object.entries(figures).every(([k, v]) => (prior[k] ?? null) === v)) return false;
  await prisma.medSchoolStats.update({
    where: { id: (prior as { id: string }).id },
    data: { ...figures, sourceUpdatedAt: at },
  });
  return true;
}
