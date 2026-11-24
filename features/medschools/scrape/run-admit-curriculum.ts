/**
 * The `medschools.admit-curriculum` job: Admit.org's curriculum table (`getAllSchoolCurriculum`, no arguments, about 190
 * schools) in ONE request, stored as `ADMIT` school facts. Weekly, off-peak, no model and no dedupe secret (no person is
 * anywhere in the reply). The request goes through the Admit host, so it spends the host's persisted daily budget like
 * every other Admit job, behind the host's spacing, robots.txt check and three-strike halt.
 *
 * Never throws. A reply with no valid row writes nothing and fails the run; a school Admit omits keeps its rows (only a
 * school that is in the reply has kinds deleted), so a thin reply cannot wipe the table.
 */
import { createAdmitClient, AdmitResponseError } from './adapters/admit';
import { importAdmitCurriculum } from './admit-curriculum';
import type { PoliteHost } from './http';
import { brief, closeStaleRuns, lastRealRunWithin } from './run-support';
import type { Logger, MedPrisma } from './types';

export const ADMIT_CURRICULUM_JOB = 'admit-curriculum';
/** The cron is weekly; a non-manual run inside this window of a real run is skipped (a restart or a duplicate trigger). */
export const ADMIT_CURRICULUM_MIN_INTERVAL_MS = 6 * 86_400_000;
/** Saturday 02:25 UTC: off-peak, after the 02:00 jobs of other tiers and well before the Admit interview walk. */
export const ADMIT_CURRICULUM_CRON = '25 2 * * 6';
/** The whole run (one request plus the writes) ends itself after this long. */
export const ADMIT_CURRICULUM_MAX_RUNTIME_MS = 5 * 60_000;

export interface AdmitCurriculumDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  maxRuntimeMs?: number;
}

export type AdmitCurriculumOutcome = 'ran' | 'skipped-min-interval';

export interface AdmitCurriculumSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  outcome: AdmitCurriculumOutcome;
  fetched: number;
  malformedRows: number;
  schools: number;
  unmatched: number;
  facts: number;
  removed: number;
  requests: number;
  durationMs: number;
}

/** True until one run has finished OK or PARTIAL: the worker queues the first run at start. */
export async function admitCurriculumOwed(prisma: MedPrisma): Promise<boolean> {
  const rows = await prisma.medSourceRun.findMany({ where: { source: 'ADMIT', job: ADMIT_CURRICULUM_JOB } });
  return !rows.some((r) => r.status === 'OK' || r.status === 'PARTIAL');
}

export async function runAdmitCurriculum(
  deps: AdmitCurriculumDeps,
  opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
): Promise<AdmitCurriculumSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const maxRuntimeMs = deps.maxRuntimeMs ?? ADMIT_CURRICULUM_MAX_RUNTIME_MS;
  const t0 = now().getTime();
  const summary: AdmitCurriculumSummary = {
    runId: '',
    status: 'FAILED',
    outcome: 'ran',
    fetched: 0,
    malformedRows: 0,
    schools: 0,
    unmatched: 0,
    facts: 0,
    removed: 0,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): AdmitCurriculumSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  await closeStaleRuns(prisma, 'ADMIT', ADMIT_CURRICULUM_JOB, now, log);
  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'ADMIT', job: ADMIT_CURRICULUM_JOB, trigger: opts.trigger, status: 'RUNNING', startedAt: now() },
    });
  } catch (e) {
    log.error(`admit-curriculum: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session();
  let error: string | null = null;
  let status: AdmitCurriculumSummary['status'] = 'OK';
  try {
    // Once per interval: a restart, a duplicate trigger or a mistyped cron cannot spend the request more than weekly.
    let recent = false;
    if (opts.trigger !== 'MANUAL') {
      recent = true; // a ledger read error fails closed: a background job spends unattended
      try {
        recent = await lastRealRunWithin(
          prisma,
          'ADMIT',
          ADMIT_CURRICULUM_JOB,
          ADMIT_CURRICULUM_MIN_INTERVAL_MS,
          now(),
        );
      } catch (e) {
        log.warn(`admit-curriculum: could not read the last run: ${brief(e)}`);
      }
    }
    if (recent) {
      summary.outcome = 'skipped-min-interval';
    } else {
      const client = createAdmitClient(session, { secret: '', now });
      const { schools, malformedRows } = await client.fetchCurriculum();
      summary.fetched = schools.length;
      summary.malformedRows = malformedRows;
      const imported = await importAdmitCurriculum(prisma, schools, {
        fetchedOn: now(),
        log,
        shouldStop: () => deps.shouldStop() || now().getTime() - t0 > maxRuntimeMs,
      });
      summary.schools = imported.schools;
      summary.unmatched = imported.unmatched;
      summary.facts = imported.facts;
      summary.removed = imported.removed;
      if (imported.stopped || malformedRows > 0) status = 'PARTIAL';
    }
  } catch (e) {
    status = 'FAILED';
    error = brief(e);
    if (!(e instanceof AdmitResponseError)) log.error(`admit-curriculum: ${error}`);
  }
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
    log.error(`admit-curriculum: could not close run: ${brief(e)}`);
  }
  log.info(
    `admit-curriculum: ${status} outcome=${summary.outcome} fetched=${summary.fetched} schools=${summary.schools} unmatched=${summary.unmatched} facts=${summary.facts} removed=${summary.removed} requests=${summary.requests}`,
  );
  return summary;
}
