/**
 * The `medschools.admit-history` job: the whole cycle from Admit, not just the live feed's 6 h window.
 *
 * Admit's live feed is about 6 hours deep, but one profile lookup (`getCycleTrackProfileByUserId`) returns an
 * applicant's dated history back to their cycle start. This job discovers members from `getAllCycleResults` (every
 * status filter, paged), fetches each unseen member's profile once, maps every history entry to an anonymous event keyed
 * by member, and rolls the touched days up. The live feed ingests the history of any new member it meets, with the same
 * key, so the two paths never double count (`admit-events.ts`).
 *
 * Anonymity: a member's id lives in memory for the run (inside a `LookupToken`). The only thing stored about a member is
 * `MedAdmitMember.memberHash`, a keyed hash of a different input from every event key, plus a state. The progress set is
 * hashes only; the discovery is repeated each run (it is a handful of requests), so no raw id has to be kept to resume.
 * Resumable: members marked DONE are skipped, so a deploy or a capped run continues where it stopped. Polite: the
 * backfill spacing on the shared Admit host, robots, Retry-After and the three-strike halt come from `http.ts`; a cap on
 * profiles per run and a deadline bound the run.
 *
 * Never throws. Nothing person-shaped is written, logged or returned.
 */
import { createAdmitClient, flagToProgram } from './adapters/admit';
import {
  commitAdmitEvents,
  loadMemberStates,
  markMember,
  memberSettled,
  pruneMembers,
  type AdmitCandidate,
} from './admit-events';
import { ensureAdmitRekey } from './admit-rekey';
import { BudgetExhaustedError, SourceHaltedError, type PoliteHost } from './http';
import type { DailyBudget } from './request-budget';
import { rollupEventCounts, type TouchedCell } from './rollup-events';
import { brief, closeStaleRuns, recordAliasMiss } from './run-support';
import { SOURCES } from './sources';
import { signalNewLiveEvents } from '../live-signal.server';
import type { Logger, MedPrisma } from './types';

export interface AdmitHistoryDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** Profile lookups allowed per run (default 600, about 40 minutes at the 3-4 s backfill gap). */
  maxProfiles?: number;
  /** Members processed (and rolled up and marked) per batch; a crash loses at most one batch of roll-ups. Default 20. */
  batchSize?: number;
  /** Wall-clock budget for the run (default 2 h); the run stops cleanly when it is spent. */
  deadlineMs?: number;
  /**
   * The job's own DAILY quota of profile lookups, shared by every run of the day and persisted (a second key beside the
   * host budget every request already spends). One unit is taken per profile lookup; with none left the run ends PARTIAL.
   */
  quota?: DailyBudget;
}

export interface AdmitHistorySummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  /** Distinct members `getAllCycleResults` listed. */
  discovered: number;
  /** Listed members already ingested (or failing repeatedly this week): no request. */
  settled: number;
  /** Profiles fetched this run. */
  fetched: number;
  /** Profiles that no longer exist or are hidden (marked done; no history). */
  noProfile: number;
  /** Lookups that failed; the member is retried next run (three failures park it for a week). */
  failedLookups: number;
  /** True when the day's request budget or the job's daily quota ran out during the run. */
  budgetSpent: boolean;
  /** Members still to fetch when the run stopped (cap, deadline, halt or shutdown). */
  remaining: number;
  /** Discovery statuses whose requests failed. */
  failedStatuses: number;
  discoveryPages: number;
  eventsCreated: number;
  /** Stored events moved to an earlier date (the earliest report wins); never a second event. */
  eventsMoved: number;
  /** History events whose key was already stored (the live feed or an earlier sighting got there first). */
  eventsExisting: number;
  /** History entries dropped: a decision with no date or an unknown decision, a bad or future date, a malformed entry. */
  entriesSkipped: number;
  misses: number;
  aliasMissErrors: number;
  rolledUp: number;
  pruned: number;
  requests: number;
  durationMs: number;
}

const DEFAULT_MAX_PROFILES = 600;
const DEFAULT_BATCH = 20;
const DEFAULT_DEADLINE_MS = 2 * 3_600_000;
const SCHOOL_CHUNK = 25;

export async function runAdmitHistory(
  deps: AdmitHistoryDeps,
  opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
): Promise<AdmitHistorySummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const maxProfiles = deps.maxProfiles ?? DEFAULT_MAX_PROFILES;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH;
  const deadlineMs = deps.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const t0 = now().getTime();
  const summary: AdmitHistorySummary = {
    runId: '',
    status: 'FAILED',
    discovered: 0,
    settled: 0,
    fetched: 0,
    noProfile: 0,
    failedLookups: 0,
    remaining: 0,
    budgetSpent: false,
    failedStatuses: 0,
    discoveryPages: 0,
    eventsCreated: 0,
    eventsMoved: 0,
    eventsExisting: 0,
    entriesSkipped: 0,
    misses: 0,
    aliasMissErrors: 0,
    rolledUp: 0,
    pruned: 0,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): AdmitHistorySummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  log.info(`admit-history: run starting (trigger=${opts.trigger})`);
  if (deps.secret.length < 16) {
    log.error('admit-history: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped');
    return finish();
  }
  // Before the first backfill write: the per-update ADMIT events would be counted again under the member key.
  if (!(await ensureAdmitRekey(prisma, log, now))) {
    log.error('admit-history: the one-time Admit re-key has not completed; run skipped');
    return finish();
  }
  await closeStaleRuns(prisma, 'ADMIT', 'admit-history', now, log);

  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'ADMIT', job: 'admit-history', trigger: opts.trigger, status: 'RUNNING' },
    });
  } catch (e) {
    log.error(`admit-history: could not open run: ${brief(e)}`);
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
    const schoolBySlug = new Map(aliases.map((a) => [a.sourceKey, a.schoolId]));
    const missed = new Set<string>();
    const resolveSlug = async (slug: string): Promise<string | null> => {
      const schoolId = schoolBySlug.get(slug);
      if (schoolId === undefined) {
        if (!missed.has(slug)) {
          missed.add(slug);
          try {
            if (await recordAliasMiss(prisma, 'ADMIT', slug, now)) summary.misses++;
          } catch (e) {
            summary.aliasMissErrors++;
            log.warn(`admit-history: alias miss write failed: ${brief(e)}`);
          }
        }
        return null;
      }
      return active.has(schoolId) ? schoolId : null;
    };

    let found: Awaited<ReturnType<typeof client.discoverMembers>> = { tokens: [], pages: 0, failedStatuses: 0 };
    try {
      found = await client.discoverMembers();
    } catch (e) {
      // A halt (three strikes, or the day's budget) ends the run here, PARTIAL, with nothing fetched.
      if (!(e instanceof SourceHaltedError)) throw e;
      incomplete = true;
    }
    summary.discovered = found.tokens.length;
    summary.discoveryPages = found.pages;
    summary.failedStatuses = found.failedStatuses;
    if (found.failedStatuses > 0) incomplete = true;

    const hashes = found.tokens.map((t) => client.memberHashOf(t) ?? '');
    const states = await loadMemberStates(prisma, hashes);
    const pending = found.tokens
      .map((token, i) => ({ token, member: hashes[i] ?? '' }))
      .filter((m) => m.member !== '' && !memberSettled(states.get(m.member), now()));
    summary.settled = found.tokens.length - pending.length;

    const deadlineAt = t0 + deadlineMs;
    const stopped = (): boolean =>
      deps.shouldStop() || session.halted || client.lookupsStopped || now().getTime() >= deadlineAt;

    let next = 0;
    let doneBatches = false;
    while (!doneBatches) {
      const candidates: AdmitCandidate[] = [];
      const doneMembers: string[] = [];
      let taken = 0;
      while (next < pending.length && taken < batchSize) {
        if (stopped() || client.lookups >= maxProfiles) {
          doneBatches = true;
          break;
        }
        const { token, member } = pending[next]!;
        // A cached profile costs no request; only a real lookup spends the day's quota.
        if (!client.isCached(token) && deps.quota && !(await deps.quota.take())) {
          summary.budgetSpent = true;
          doneBatches = true;
          break;
        }
        let profile;
        try {
          profile = await client.profileOf(token);
        } catch (e) {
          if (!(e instanceof SourceHaltedError)) throw e;
          if (e instanceof BudgetExhaustedError) summary.budgetSpent = true;
          doneBatches = true;
          break;
        }
        next++;
        taken++;
        if (profile === 'FAILED') {
          summary.failedLookups++;
          await markMember(prisma, member, 'FAILED', now());
          continue;
        }
        summary.fetched++;
        if (profile.flag === 'UNREADABLE') summary.noProfile++;
        summary.entriesSkipped +=
          profile.skipped.unknownDecision + profile.skipped.badDate + profile.skipped.malformedEntries;
        const program = flagToProgram(profile.flag);
        for (const h of profile.history) {
          const schoolId = await resolveSlug(h.schoolKey);
          if (schoolId === null) continue;
          candidates.push({
            schoolId,
            cycleYear: h.cycleYear,
            program,
            eventType: h.eventType,
            occurredAt: h.occurredAt,
            dedupeHash: h.keyFor(schoolId),
          });
        }
        doneMembers.push(member);
      }
      if (next >= pending.length) doneBatches = true;

      if (candidates.length > 0) {
        const res = await commitAdmitEvents(prisma, candidates);
        // Committed: a recent event signals the open live pages (coalesced; an old one sends nothing).
        signalNewLiveEvents(res.newestCreated);
        summary.eventsCreated += res.created;
        summary.eventsMoved += res.moved;
        summary.eventsExisting += res.existing;
        summary.rolledUp += await rollupBySchool(prisma, res.touched);
      }
      // Marked after the events and cells are written: a crash before this line re-ingests the batch, which the
      // member key makes a no-op and the roll-up of stored cells repairs.
      for (const member of doneMembers) await markMember(prisma, member, 'DONE', now());
      if (taken === 0) doneBatches = true;
    }

    summary.remaining = pending.length - next;
    if (summary.remaining > 0 || summary.failedLookups > 0) incomplete = true;
    if (session.halted) {
      incomplete = true;
      error = brief(session.lastFailure ?? 'source halted');
      if (error.includes('daily request budget')) summary.budgetSpent = true;
    }
    try {
      summary.pruned = await pruneMembers(prisma, now());
    } catch (e) {
      log.warn(`admit-history: member prune failed: ${brief(e)}`);
    }
  } catch (e) {
    error = brief(e);
    log.error(`admit-history: run failed: ${error}`);
    return await close('FAILED');
  }
  return await close(incomplete ? 'PARTIAL' : 'OK');

  async function close(status: AdmitHistorySummary['status']): Promise<AdmitHistorySummary> {
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
      log.error(`admit-history: could not close run: ${brief(e)}`);
    }
    log.info(
      `admit-history: ${status} discovered=${summary.discovered} settled=${summary.settled} fetched=${summary.fetched} failed=${summary.failedLookups} remaining=${summary.remaining} created=${summary.eventsCreated} moved=${summary.eventsMoved} existing=${summary.eventsExisting} rolledUp=${summary.rolledUp} requests=${summary.requests}`,
    );
    return finish();
  }
}

/** Roll the touched cells up a few schools at a time, so one batch never loads a whole cycle of events at once. */
async function rollupBySchool(prisma: MedPrisma, touched: TouchedCell[]): Promise<number> {
  const bySchool = new Map<string, TouchedCell[]>();
  for (const c of touched) bySchool.set(c.schoolId, [...(bySchool.get(c.schoolId) ?? []), c]);
  const schools = [...bySchool.keys()];
  let written = 0;
  for (let i = 0; i < schools.length; i += SCHOOL_CHUNK) {
    const cells = schools.slice(i, i + SCHOOL_CHUNK).flatMap((id) => bySchool.get(id) ?? []);
    written += await rollupEventCounts(prisma, { source: 'ADMIT', touched: cells });
  }
  return written;
}

/**
 * True until one history pass has completed (a run that ended OK or PARTIAL): the worker queues a bootstrap run at
 * start while it is owed, so the first deploy backfills at once and an interrupted first run is picked up again at the
 * next start instead of waiting for the daily cron.
 */
export async function admitHistoryOwed(prisma: MedPrisma): Promise<boolean> {
  const rows = await prisma.medSourceRun.findMany({ where: { source: 'ADMIT', job: 'admit-history' } });
  return !rows.some((r) => r.status === 'OK' || r.status === 'PARTIAL');
}
