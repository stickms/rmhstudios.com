/**
 * The `medschools.admit-live` job: poll Admit's recent-updates feed, resolve each unseen event's program
 * (MD vs MD-PhD) with one profile lookup per distinct author, store the anonymous event and roll the touched
 * days up into `MedCycleCount` (spec §4a). Events key on the member (`admit-events.ts`), and the same lookup's
 * profile history is ingested the first time a member is seen, so the live feed seeds the backfill too.
 *
 * Never throws. The author handle never leaves `client.programOf`; nothing person-shaped reaches a write or a
 * log line, and `MedSourceRun.stats` holds counters only.
 */
import { createAdmitClient, flagToProgram } from './adapters/admit';
import { SourceHaltedError, type PoliteHost } from './http';
import { brief, closeStaleRuns, recordAliasMiss } from './run-support';
import {
  commitAdmitEvents,
  findStoredEvents,
  loadMemberStates,
  markMember,
  memberSettled,
  type AdmitCandidate,
} from './admit-events';
import { ensureAdmitRekey } from './admit-rekey';
import { rollupEventCounts } from './rollup-events';
import type { Logger, MedPrisma } from './types';

export interface AdmitLiveDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** Distinct profile lookups allowed per run (default 120). */
  maxLookups?: number;
}

export interface AdmitLiveSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  fetched: number;
  created: number;
  alreadyStored: number;
  deferred: number;
  programNull: number;
  misses: number;
  unknownStatus: number;
  badDate: number;
  /** Feed rows dropped for failing validation (e.g. a null school slug). */
  malformedRows: number;
  /** Alias-miss writes that failed; the run carried on. */
  aliasMissErrors: number;
  lookups: number;
  rolledUp: number;
  /** Stored events whose date moved earlier because a later sighting was older (never a second event). */
  moved: number;
  /** Members seen for the first time, whose profile history this run ingested from the lookup it already made. */
  membersIngested: number;
  /** History events produced by those lookups (before the member-key dedupe). */
  historyEvents: number;
  requests: number;
  durationMs: number;
}

const DEFAULT_MAX_LOOKUPS = 120;

export async function runAdmitLive(
  deps: AdmitLiveDeps,
  opts: {
    trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP';
  },
): Promise<AdmitLiveSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const maxLookups = deps.maxLookups ?? DEFAULT_MAX_LOOKUPS;
  const t0 = now().getTime();
  const summary: AdmitLiveSummary = {
    runId: '',
    status: 'FAILED',
    fetched: 0,
    created: 0,
    alreadyStored: 0,
    deferred: 0,
    programNull: 0,
    misses: 0,
    unknownStatus: 0,
    badDate: 0,
    malformedRows: 0,
    aliasMissErrors: 0,
    lookups: 0,
    rolledUp: 0,
    moved: 0,
    membersIngested: 0,
    historyEvents: 0,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): AdmitLiveSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  if (deps.secret.length < 16) {
    log.error('admit-live: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped');
    return finish();
  }

  // The one-time move from per-update keys to member keys must precede the first write under the new key.
  if (!(await ensureAdmitRekey(prisma, log, now))) {
    log.error('admit-live: the one-time Admit re-key has not completed; run skipped');
    return finish();
  }

  await closeStaleRuns(prisma, 'ADMIT', 'admit-live', now, log);

  let run: {
    id: string;
  };
  try {
    run = await prisma.medSourceRun.create({
      data: {
        source: 'ADMIT',
        job: 'admit-live',
        trigger: opts.trigger,
        status: 'RUNNING',
      },
    });
  } catch (e) {
    log.error(`admit-live: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session();
  const client = createAdmitClient(session, {
    secret: deps.secret,
    now,
  });
  let error: string | null = null;
  let incomplete = false;

  try {
    const { items, skipped } = await client.fetchFeed();
    summary.fetched = items.length;
    summary.unknownStatus = skipped.unknownStatus;
    summary.badDate = skipped.badDate;
    summary.malformedRows = skipped.malformedRows;

    const aliases = await prisma.medSchoolAlias.findMany({
      where: {
        source: 'ADMIT',
      },
    });
    const active = new Set(
      (
        await prisma.medSchool.findMany({
          where: {
            active: true,
          },
        })
      ).map((s) => s.id),
    );
    const schoolBySlug = new Map(aliases.map((a) => [a.sourceKey, a.schoolId]));

    // Resolve a slug to an active school; an unknown slug is skipped and recorded once per run (D8: not when ignored).
    const missed = new Set<string>();
    const resolveSlug = async (slug: string): Promise<string | null> => {
      const schoolId = schoolBySlug.get(slug);
      if (schoolId === undefined) {
        if (!missed.has(slug)) {
          missed.add(slug);
          try {
            if (await recordAliasMiss(prisma, 'ADMIT', slug, now)) summary.misses++;
          } catch (e) {
            // A failed miss write must not abort the feed: the event is skipped as before.
            summary.aliasMissErrors++;
            log.warn(`admit-live: alias miss write failed: ${brief(e)}`);
          }
        }
        return null;
      }
      return active.has(schoolId) ? schoolId : null;
    };

    // One entry per member key: the same member reporting a status twice (or at two times) counts once, at the
    // earliest date seen.
    const resolved = new Map<
      string,
      {
        item: (typeof items)[number];
        schoolId: string;
        hash: string;
        occurredAt: Date;
      }
    >();
    for (const item of items) {
      const schoolId = await resolveSlug(item.event.schoolKey);
      if (schoolId === null) continue;
      const hash = item.keyFor(schoolId);
      const dup = resolved.get(hash);
      if (dup) {
        if (item.event.occurredAt < dup.occurredAt) dup.occurredAt = item.event.occurredAt;
        continue;
      }
      resolved.set(hash, { item, schoolId, hash, occurredAt: item.event.occurredAt });
    }

    // Stored events are read back with their labels: their cells are rolled up again, so a roll-up that failed
    // after an earlier insert is repaired by the next run.
    const stored = await findStoredEvents(prisma, [...resolved.keys()]);
    // Members whose whole history was already ingested need no history again; the lookup that gives the program also
    // returns the history, so a new member's history costs no extra request.
    const memberOf = new Map<(typeof items)[number], string | null>();
    for (const { item } of resolved.values()) memberOf.set(item, client.memberHashOf(item.lookup));
    const memberStates = await loadMemberStates(prisma, [
      ...new Set([...memberOf.values()].filter((h): h is string => h !== null)),
    ]);
    const ingested = new Set<string>();

    const candidates: AdmitCandidate[] = [];
    let stop = false;
    for (const { item, schoolId, hash, occurredAt } of resolved.values()) {
      const ev = item.event;
      const prior = stored.get(hash);
      if (prior) {
        summary.alreadyStored++;
        candidates.push({
          schoolId: prior.schoolId,
          cycleYear: prior.cycleYear,
          program: prior.program,
          eventType: ev.eventType,
          occurredAt,
          dedupeHash: hash,
        });
        continue;
      }
      if (stop || deps.shouldStop() || session.halted) {
        stop = true;
        summary.deferred++;
        continue;
      }
      if (!client.isCached(item.lookup) && client.lookups >= maxLookups) {
        summary.deferred++;
        continue;
      }
      let profile;
      try {
        profile = await client.profileOf(item.lookup);
      } catch (e) {
        if (!(e instanceof SourceHaltedError)) throw e;
        stop = true;
        summary.deferred++;
        continue;
      }
      if (profile === 'FAILED') {
        summary.deferred++;
        continue;
      }
      const program = flagToProgram(profile.flag);
      if (program === null) summary.programNull++;
      candidates.push({
        schoolId,
        cycleYear: ev.cycleYear,
        program,
        eventType: ev.eventType,
        occurredAt,
        dedupeHash: hash,
      });
      // A member seen for the first time: the history this lookup already returned is ingested too.
      const member = memberOf.get(item) ?? null;
      if (member !== null && !ingested.has(member) && !memberSettled(memberStates.get(member), now())) {
        ingested.add(member);
        for (const h of profile.history) {
          const histSchool = await resolveSlug(h.schoolKey);
          if (histSchool === null) continue;
          candidates.push({
            schoolId: histSchool,
            cycleYear: h.cycleYear,
            program,
            eventType: h.eventType,
            occurredAt: h.occurredAt,
            dedupeHash: h.keyFor(histSchool),
          });
          summary.historyEvents++;
        }
      }
    }
    summary.lookups = client.lookups;
    if (summary.deferred > 0 || client.lookupsStopped) incomplete = true;

    // Diffing against the stored counts makes unchanged cells a no-op, so this is safe on every run.
    const res = await commitAdmitEvents(prisma, candidates, stored);
    summary.created = res.created;
    summary.moved = res.moved;
    if (res.touched.length > 0)
      summary.rolledUp = await rollupEventCounts(prisma, {
        source: 'ADMIT',
        touched: res.touched,
      });
    // Marked only after the events and cells are written, so a failed write re-ingests the member next time.
    for (const member of ingested) await markMember(prisma, member, 'DONE', now());
    summary.membersIngested = ingested.size;
    if (stop && session.halted) error = brief(session.lastFailure ?? 'source halted');
  } catch (e) {
    error = brief(e);
    log.error(`admit-live: run failed: ${error}`);
    summary.lookups = client.lookups;
    return await close('FAILED');
  }
  return await close(incomplete ? 'PARTIAL' : 'OK');

  async function close(status: AdmitLiveSummary['status']): Promise<AdmitLiveSummary> {
    summary.status = status;
    summary.requests = session.requests;
    finish();
    const { runId: _id, status: _s, ...counters } = summary;
    try {
      await prisma.medSourceRun.update({
        where: {
          id: run.id,
        },
        data: {
          status,
          finishedAt: now(),
          stats: counters,
          error,
        },
      });
    } catch (e) {
      log.error(`admit-live: could not close run: ${brief(e)}`);
    }
    log.info(
      `admit-live: ${status} fetched=${summary.fetched} created=${summary.created} stored=${summary.alreadyStored} deferred=${summary.deferred} lookups=${summary.lookups} rolledUp=${summary.rolledUp}`,
    );
    return finish();
  }
}
