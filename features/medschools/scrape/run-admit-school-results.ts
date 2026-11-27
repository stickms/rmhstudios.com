/**
 * The `medschools.admit-school-results` job: each school's results page on Admit, one request per school and cycle.
 *
 * Admit's own school page (`med.admit.org/cycle-results/<slug>`) loads `getCycleResultsBySchool(slug, year)`: the page's
 * totals ("Interviews 220") and one row per listed applicant with their MD-PhD flag and dated events, for the current
 * cycle and the two before it. That is the one source that lists a school's members for a whole cycle without a
 * profile lookup each, so it fills what the live feed (6 h deep) and the profile backfill (600 lookups a day, members
 * found one per school and status) cannot reach. Every event is keyed with the same Admit member key as theirs
 * (`admit-events.ts`: first report wins, earliest day kept), so no report is counted twice.
 *
 * Two kinds of run: `current` (daily; the cycle in progress, and through the summer the one before it, whose decisions
 * roll over on 1 September) and `past` (once, owed until one run finishes OK: the two cycles before the current one).
 * The totals Admit prints are stored per school and cycle (`MedAdmitCycleTotal`) so the index can say how many of them
 * we hold.
 *
 * Anonymity: only the member id (hashed inside the adapter's key closure and then dropped), the MD-PhD flag, the dates
 * and the decision are requested. Never a name, avatar or admit score. Nothing person-shaped is stored, logged or
 * returned. Never throws.
 */
import { createAdmitClient } from './adapters/admit';
import { AdmitResponseError } from './adapters/admit/client';
import { commitAdmitEvents, type AdmitCandidate } from './admit-events';
import { ensureAdmitRekey } from './admit-rekey';
import { BudgetExhaustedError, SourceHaltedError, type PoliteHost } from './http';
import { rollupEventCounts, type TouchedCell } from './rollup-events';
import { brief, closeStaleRuns } from './run-support';
import { SOURCES } from './sources';
import { cycleYearOf } from '../engine/cycle';
import { signalNewLiveEvents } from '../live-signal.server';
import type { Logger, MedPrisma } from './types';

export type SchoolResultsKind = 'current' | 'past';

export interface AdmitSchoolResultsDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** Wall-clock budget for the run (default 2.5 h, inside the queue's 3 h expiry); the run stops cleanly when spent. */
  deadlineMs?: number;
}

export interface AdmitSchoolResultsSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  kind: SchoolResultsKind;
  /** The cycles asked for, by start year (2026 is 2026-2027). */
  years: number[];
  schools: number;
  /** Requests that returned a page. */
  fetched: number;
  /** School and cycle pairs Admit has no page for. */
  noPage: number;
  /** Requests that failed (the pair is retried by the next run). */
  failed: number;
  /** Listed applicants skipped: no member id or a malformed row. */
  skippedRows: number;
  /** Dated entries dropped: unknown decision, missing or bad date, future date. */
  entriesSkipped: number;
  eventsCreated: number;
  eventsMoved: number;
  eventsExisting: number;
  totalsWritten: number;
  rolledUp: number;
  budgetSpent: boolean;
  /** School and cycle pairs not reached when the run stopped (deadline, halt, shutdown). */
  remaining: number;
  requests: number;
  durationMs: number;
}

const DEFAULT_DEADLINE_MS = 2.5 * 3_600_000;
/** Past cycles asked for by the one-time run: the two before the current one (Admit's page lists three cycles). */
export const SCHOOL_RESULTS_PAST_CYCLES = 2;

/** The job name in `MedSourceRun`: the daily run and the one-time past run are tracked apart. */
export const schoolResultsJob = (kind: SchoolResultsKind): string =>
  kind === 'current' ? 'admit-school-results' : 'admit-school-results-past';

/**
 * The cycles a run asks for, by start year. The cycle in progress is the one `cycleYearOf` puts a secondary in (they
 * roll over on 1 June, the earliest); through June, July and August the one before it still gets decisions, so the
 * daily run reads both then. The past run is the two before the current one.
 */
export function schoolResultsYears(kind: SchoolResultsKind, now: Date): number[] {
  const current = cycleYearOf(now, 'SECONDARY') - 1;
  if (kind === 'past') return Array.from({ length: SCHOOL_RESULTS_PAST_CYCLES }, (_, i) => current - 1 - i);
  const summer = now.getUTCMonth() >= 5 && now.getUTCMonth() <= 7;
  return summer ? [current, current - 1] : [current];
}

/** The site stores a cycle by its entry year: the page's 2026-2027 is 2027. */
export const entryYearOf = (year: number): number => year + 1;

export async function runAdmitSchoolResults(
  deps: AdmitSchoolResultsDeps,
  opts: { kind: SchoolResultsKind; trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
): Promise<AdmitSchoolResultsSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const job = schoolResultsJob(opts.kind);
  const deadlineMs = deps.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const t0 = now().getTime();
  const years = schoolResultsYears(opts.kind, now());
  const summary: AdmitSchoolResultsSummary = {
    runId: '',
    status: 'FAILED',
    kind: opts.kind,
    years,
    schools: 0,
    fetched: 0,
    noPage: 0,
    failed: 0,
    skippedRows: 0,
    entriesSkipped: 0,
    eventsCreated: 0,
    eventsMoved: 0,
    eventsExisting: 0,
    totalsWritten: 0,
    rolledUp: 0,
    budgetSpent: false,
    remaining: 0,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): AdmitSchoolResultsSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  log.info(`${job}: run starting (trigger=${opts.trigger}, years=${years.join(',')})`);
  if (deps.secret.length < 16) {
    log.error(`${job}: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped`);
    return finish();
  }
  // Before the first write: the per-update ADMIT events would be counted again under the member key.
  if (!(await ensureAdmitRekey(prisma, log, now))) {
    log.error(`${job}: the one-time Admit re-key has not completed; run skipped`);
    return finish();
  }
  await closeStaleRuns(prisma, 'ADMIT', job, now, log);

  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'ADMIT', job, trigger: opts.trigger, status: 'RUNNING' },
    });
  } catch (e) {
    log.error(`${job}: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session({
    spacingMs: SOURCES.ADMIT.backfillSpacingMs,
    jitterMs: SOURCES.ADMIT.backfillJitterMs ?? 0,
  });
  const client = createAdmitClient(session, { secret: deps.secret, now });
  let error: string | null = null;
  let incomplete = false;

  try {
    const aliases = await prisma.medSchoolAlias.findMany({ where: { source: 'ADMIT' } });
    const active = new Set((await prisma.medSchool.findMany({ where: { active: true } })).map((s) => s.id));
    // One Admit page per school: the first alias key (sorted) of each active school.
    const targets = new Map<string, string>();
    for (const a of [...aliases].sort((x, y) => x.sourceKey.localeCompare(y.sourceKey)))
      if (active.has(a.schoolId) && !targets.has(a.schoolId)) targets.set(a.schoolId, a.sourceKey);
    summary.schools = targets.size;

    const pairs = years.flatMap((year) => [...targets].map(([schoolId, slug]) => ({ year, schoolId, slug })));
    const deadlineAt = t0 + deadlineMs;
    let next = 0;
    for (; next < pairs.length; next++) {
      if (deps.shouldStop() || session.halted || now().getTime() >= deadlineAt) break;
      const { year, schoolId, slug } = pairs[next]!;
      let cycle;
      try {
        cycle = await client.fetchSchoolCycle(slug, year);
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          summary.budgetSpent = true;
          break;
        }
        if (e instanceof SourceHaltedError) break;
        if (e instanceof AdmitResponseError) {
          summary.failed++;
          continue;
        }
        throw e;
      }
      if (cycle === null) {
        summary.noPage++;
        continue;
      }
      summary.fetched++;
      summary.skippedRows += cycle.skippedRows;
      summary.entriesSkipped += cycle.skipped.unknownDecision + cycle.skipped.badDate + cycle.skipped.malformedEntries;

      const candidates: AdmitCandidate[] = cycle.members.flatMap((m) =>
        m.history.map((h) => ({
          schoolId,
          cycleYear: h.cycleYear,
          program: m.program,
          eventType: h.eventType,
          occurredAt: h.occurredAt,
          dedupeHash: h.keyFor(schoolId),
        })),
      );
      if (candidates.length > 0) {
        const res = await commitAdmitEvents(prisma, candidates);
        // Committed: a recent event signals the open live pages (coalesced; an old one sends nothing).
        signalNewLiveEvents(res.newestCreated);
        summary.eventsCreated += res.created;
        summary.eventsMoved += res.moved;
        summary.eventsExisting += res.existing;
        summary.rolledUp += await rollupSchool(prisma, res.touched);
      }
      // Admit's printed totals for the pair, stored after its events: the index sets what we hold against them.
      try {
        const data = { ...cycle.totals, fetchedAt: now() };
        await prisma.medAdmitCycleTotal.upsert({
          where: { schoolId_cycleYear: { schoolId, cycleYear: entryYearOf(year) } },
          create: { schoolId, cycleYear: entryYearOf(year), ...data },
          update: data,
        });
        summary.totalsWritten++;
      } catch (e) {
        log.warn(`${job}: totals write failed: ${brief(e)}`);
      }
    }
    summary.remaining = pairs.length - next;
    if (summary.remaining > 0 || summary.failed > 0) incomplete = true;
    if (session.halted) {
      incomplete = true;
      error = brief(session.lastFailure ?? 'source halted');
      if (error.includes('daily request budget')) summary.budgetSpent = true;
    }
  } catch (e) {
    error = brief(e);
    log.error(`${job}: run failed: ${error}`);
    return await close('FAILED');
  }
  return await close(incomplete ? 'PARTIAL' : 'OK');

  async function close(status: AdmitSchoolResultsSummary['status']): Promise<AdmitSchoolResultsSummary> {
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
      log.error(`${job}: could not close run: ${brief(e)}`);
    }
    log.info(
      `${job}: ${status} kind=${opts.kind} years=${years.join(',')} schools=${summary.schools} fetched=${summary.fetched} noPage=${summary.noPage} failed=${summary.failed} remaining=${summary.remaining} created=${summary.eventsCreated} moved=${summary.eventsMoved} existing=${summary.eventsExisting} totals=${summary.totalsWritten} rolledUp=${summary.rolledUp} requests=${summary.requests}`,
    );
    return finish();
  }
}

/** Roll one school's touched cells up (a page is one school, so one call). */
async function rollupSchool(prisma: MedPrisma, touched: TouchedCell[]): Promise<number> {
  if (touched.length === 0) return 0;
  return rollupEventCounts(prisma, { source: 'ADMIT', touched });
}

/**
 * True until one past-cycles run has finished OK: the worker queues it at start while it is owed, so the first deploy
 * backfills the two earlier cycles at once and an interrupted or budget-stopped run is picked up again by the next
 * daily tick. (Re-running is cheap to reason about: every key is a no-op the second time.)
 */
export async function schoolResultsPastOwed(prisma: MedPrisma): Promise<boolean> {
  const rows = await prisma.medSourceRun.findMany({ where: { source: 'ADMIT', job: schoolResultsJob('past') } });
  return !rows.some((r) => r.status === 'OK');
}
