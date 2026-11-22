/**
 * The `medschools.sdn-live` job: discover current-cycle threads from the forum listings (daily), poll both
 * RSS feeds, upsert one `MedSdnThread` row per school thread, send changed threads through `processThread`
 * and roll the touched days up into `MedCycleCount`.
 *
 * Never throws. Nothing person-shaped is read, written or logged here: the adapters hand back public thread
 * ids, slugs and titles only, and `MedSourceRun.stats` holds counters.
 */
import { isDeepseekPeak } from '@/lib/ai/deepseek-peak';
import { cycleYearOf } from '../engine/cycle';
import { parseThreadTitle } from '../engine/sdn-title';
import {
  SdnPageError,
  assertPage,
  forumListingUrl,
  forumRssUrl,
  parseForumListing,
  parseForumRss,
} from './adapters/sdn';
import { SourceHaltedError, type PoliteClient, type PoliteHost } from './http';
import { rollupEventCounts, type TouchedCell } from './rollup-events';
import {
  SDN_MIN_INTERVAL_MS,
  brief,
  closeStaleRuns,
  lastRealRunWithin,
  recordAliasMiss,
  type SdnRunOutcome,
} from './run-support';
import type { BudgetGate } from './sdn/budget';
import type { SdnAi } from './sdn/extract';
import { repairBackfillRollups } from './sdn/rollup-pending';
import { processThread, type ThreadDeps } from './sdn/process-thread';
import type { Logger, MedPrisma, MedSdnThreadRow } from './types';

export interface SdnForumEntry {
  node: number;
  slug: string;
  degree: string;
  cycleYear: number | null;
}
/** Shape of `data/medschools/sdn-forums.json`. */
export interface SdnForumsFile {
  generatedAt: string;
  current: SdnForumEntry[];
  archive: SdnForumEntry[];
}

export interface SdnLiveDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  ai: SdnAi;
  budget: BudgetGate;
  secret: string;
  forums: SdnForumsFile;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** Thread pages fetched per run (default 30). */
  maxPages?: number;
  /** Model calls per run (default 40). */
  maxLlmCalls?: number;
}

export interface SdnLiveSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  feedsPolled: number;
  threadsKnown: number;
  threadsChanged: number;
  pending: number;
  /** Threads walked to the end this run. */
  processed: number;
  pages: number;
  llmCalls: number;
  eventsCreated: number;
  questionsCreated: number;
  misses: number;
  degreeMismatch: number;
  batchesDropped: number;
  rolledUp: number;
  staleForumConfig: boolean;
  aiConfigured: boolean;
  budgetPaused: boolean;
  /** The run stopped calling the model (or never started) because DeepSeek peak hours began or were on. */
  peakPaused: boolean;
  outcome: SdnRunOutcome;
  requests: number;
  durationMs: number;
  discovered: boolean;
  discoveryAttemptedAt: string | null;
  halted: boolean;
  unlabelled: number;
  aliasMissErrors: number;
  threadsSkipped: number;
  threadsFailed: number;
  scannedCount: number;
  filteredCount: number;
  extractFailed: number;
  rejected: number;
  cursorLost: number;
  rollupErrors: number;
}

const DEFAULT_MAX_PAGES = 30;
const DEFAULT_MAX_LLM_CALLS = 40;
const MAX_LISTING_PAGES = 12;
/** Consecutive per-thread failures (across runs) before the thread is parked for 24 h. */
const MAX_THREAD_FAILURES = 3;
const DAY_MS = 86_400_000;

interface Seen {
  threadId: number;
  slug: string;
  title: string;
  replies: number | null;
  lastActivityAt: Date | null;
}

export async function runSdnLive(
  deps: SdnLiveDeps,
  opts: {
    trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP';
  },
): Promise<SdnLiveSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const t0 = now().getTime();
  const summary: SdnLiveSummary = {
    runId: '',
    status: 'FAILED',
    feedsPolled: 0,
    threadsKnown: 0,
    threadsChanged: 0,
    pending: 0,
    processed: 0,
    pages: 0,
    llmCalls: 0,
    eventsCreated: 0,
    questionsCreated: 0,
    misses: 0,
    degreeMismatch: 0,
    batchesDropped: 0,
    rolledUp: 0,
    staleForumConfig: false,
    aiConfigured: true,
    budgetPaused: false,
    peakPaused: false,
    outcome: 'ran',
    requests: 0,
    durationMs: 0,
    discovered: false,
    discoveryAttemptedAt: null,
    halted: false,
    unlabelled: 0,
    aliasMissErrors: 0,
    threadsSkipped: 0,
    threadsFailed: 0,
    scannedCount: 0,
    filteredCount: 0,
    extractFailed: 0,
    rejected: 0,
    cursorLost: 0,
    rollupErrors: 0,
  };
  const finish = (): SdnLiveSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  if (deps.secret.length < 16) {
    log.error('sdn-live: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped');
    return finish();
  }

  await closeStaleRuns(prisma, 'SDN', 'sdn-live', now, log);
  let run: {
    id: string;
  };
  try {
    run = await prisma.medSourceRun.create({
      data: {
        source: 'SDN',
        job: 'sdn-live',
        trigger: opts.trigger,
        status: 'RUNNING',
        startedAt: now(),
      },
    });
  } catch (e) {
    log.error(`sdn-live: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session();
  let error: string | null = null;
  let incomplete = false;
  const state = {
    pages: 0,
    llmCalls: 0,
  };

  // Off-peak only and about once a day (unless a person asked): nothing is fetched and nothing reaches the model.
  if (opts.trigger !== 'MANUAL') {
    if (isDeepseekPeak(now())) {
      summary.outcome = 'paused-peak';
      summary.peakPaused = true;
      return await close('OK');
    }
    let recent = true; // a ledger read error fails closed: a background job spends unattended
    try {
      recent = await lastRealRunWithin(prisma, 'SDN', 'sdn-live', SDN_MIN_INTERVAL_MS, now());
    } catch (e) {
      log.warn(`sdn-live: could not read the last run: ${brief(e)}`);
    }
    if (recent) {
      summary.outcome = 'skipped-min-interval';
      return await close('OK');
    }
  }
  // Even a manual run's model calls (and a run that crosses into peak) are refused at peak.
  let peakHit = false;
  const budget: BudgetGate = {
    async allow(kind) {
      if (isDeepseekPeak(now())) {
        peakHit = true;
        return false;
      }
      return deps.budget.allow(kind);
    },
  };

  try {
    // Aliases and schools.
    const aliases = await prisma.medSchoolAlias.findMany({
      where: {
        source: 'SDN',
      },
    });
    const schoolIdByStem = new Map(aliases.map((a) => [a.sourceKey, a.schoolId]));
    const schools = new Map((await prisma.medSchool.findMany()).map((s) => [s.id, s]));

    // Thread rows already known. The live set (archive: false) and the backfill set (archive: true) are disjoint:
    // a row's flag is only ever written when it is created, the live tick skips archive rows entirely and the
    // backfill walks only archive rows, so the two jobs can never process the same thread.
    const allRows = await prisma.medSdnThread.findMany();
    const known = new Map<number, MedSdnThreadRow>(allRows.filter((t) => !t.archive).map((t) => [t.threadId, t]));
    const archiveIds = new Set<number>(allRows.filter((t) => t.archive).map((t) => t.threadId));

    const changed = new Set<number>();
    const forced = new Set<number>();
    const seenThreads = new Map<
      number,
      {
        schoolId: string;
        cycleYear: number;
      }
    >();
    const missed = new Set<string>();
    const parsedCycles: number[] = [];

    async function resolveAndUpsert(item: Seen, forum: SdnForumEntry, fromFeed: boolean): Promise<void> {
      const parsed = parseThreadTitle(item.title);
      if (!parsed) {
        summary.unlabelled++;
        return;
      }
      if (fromFeed) parsedCycles.push(parsed.cycleYear);
      const schoolId = schoolIdByStem.get(parsed.stem);
      if (schoolId === undefined) {
        if (!missed.has(parsed.stem)) {
          missed.add(parsed.stem);
          try {
            if (await recordAliasMiss(prisma, 'SDN', parsed.stem, now)) summary.misses++;
          } catch (e) {
            summary.aliasMissErrors++;
            log.warn(`sdn-live: alias miss write failed: ${brief(e)}`);
          }
        }
        return;
      }
      const school = schools.get(schoolId);
      if (!school || !school.active) return;
      if (school.degree !== forum.degree) {
        summary.degreeMismatch++;
        return;
      }
      if (archiveIds.has(item.threadId)) return; // the backfill's thread; never flip or process it here
      seenThreads.set(item.threadId, {
        schoolId,
        cycleYear: parsed.cycleYear,
      });
      const prior = known.get(item.threadId);
      const fields = {
        slug: item.slug,
        schoolId,
        cycleYear: parsed.cycleYear,
        degree: forum.degree,
        archive: false,
      };
      if (!prior) {
        const row = await prisma.medSdnThread.upsert({
          where: {
            threadId: item.threadId,
          },
          create: {
            threadId: item.threadId,
            ...fields,
            repliesSeen: item.replies ?? 0,
            repliesDone: -1,
            lastActivityAt: item.lastActivityAt,
            cursorPage: 1,
            cursorPostHash: null,
            postsProcessed: 0,
          },
          // Cursor fields are never part of an update from polling, and neither is `archive` (a row the
          // backfill created between our read and this write stays the backfill's).
          update: {
            slug: fields.slug,
            schoolId: fields.schoolId,
            cycleYear: fields.cycleYear,
            degree: fields.degree,
            ...(item.replies !== null
              ? {
                  repliesSeen: item.replies,
                }
              : {}),
            ...(item.lastActivityAt
              ? {
                  lastActivityAt: item.lastActivityAt,
                }
              : {}),
          },
        });
        known.set(item.threadId, row);
        changed.add(item.threadId);
        return;
      }
      const data: Record<string, unknown> = {};
      if (prior.slug !== fields.slug) data.slug = fields.slug;
      if (prior.schoolId !== schoolId) data.schoolId = schoolId;
      if (prior.cycleYear !== fields.cycleYear) data.cycleYear = fields.cycleYear;
      if (prior.degree !== fields.degree) data.degree = fields.degree;
      if (item.replies !== null && prior.repliesSeen !== item.replies) {
        data.repliesSeen = item.replies;
        changed.add(item.threadId);
      }
      if (item.replies === null) {
        forced.add(item.threadId);
        changed.add(item.threadId);
      }
      if (
        item.lastActivityAt &&
        // The feed owns the activity time (listing and feed stamps differ); a listing only fills a gap.
        (fromFeed ? prior.lastActivityAt?.getTime() !== item.lastActivityAt.getTime() : !prior.lastActivityAt)
      )
        data.lastActivityAt = item.lastActivityAt;
      if (Object.keys(data).length > 0) {
        const row = await prisma.medSdnThread.update({
          where: {
            threadId: item.threadId,
          },
          data,
        });
        known.set(item.threadId, {
          ...prior,
          ...row,
        });
      }
    }

    // Fetch one page, guarded; returns the body or null (page-level failure, logged).
    async function fetchBody(client: PoliteClient, path: string, what: string): Promise<string | null> {
      try {
        const res = await client.get(path);
        const body = assertPage(res, client, what);
        return body;
      } catch (e) {
        if (e instanceof SourceHaltedError || client.halted) {
          summary.halted = true;
          return null;
        }
        log.warn(`sdn-live: ${what} failed (${e instanceof SdnPageError ? 'page' : 'error'})`);
        return null;
      }
    }
    const unparseable = (what: string): null => {
      session.noteFailure(`${what}: unparseable`);
      log.warn(`sdn-live: ${what} unparseable`);
      return null;
    };

    // The discovery window: one attempt per 24 h, counted from the last ATTEMPT (success or not), so a
    // failing listing is never retried every tick.
    const since = new Date(now().getTime() - DAY_MS);
    const recent = await prisma.medSourceRun.findMany({
      where: {
        source: 'SDN',
        job: 'sdn-live',
        startedAt: {
          gte: since,
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: 200,
    });
    const attemptedRecently = recent.some((r) => {
      const at =
        r.stats !== null && typeof r.stats === 'object'
          ? (r.stats as Record<string, unknown>).discoveryAttemptedAt
          : null;
      return typeof at === 'string' && new Date(at).getTime() >= since.getTime();
    });
    const discoveryTick = !attemptedRecently;

    // 1. Poll both RSS feeds.
    for (const forum of deps.forums.current) {
      if (deps.shouldStop()) {
        incomplete = true;
        break;
      }
      const body = await fetchBody(session, forumRssUrl(forum.node), 'sdn rss');
      if (body === null) {
        incomplete = true;
        if (summary.halted || session.halted) break;
        continue;
      }
      let items;
      try {
        items = parseForumRss(body);
      } catch {
        unparseable('sdn rss');
        incomplete = true;
        continue;
      }
      session.noteSuccess();
      summary.feedsPolled++;
      for (const it of items)
        await resolveAndUpsert(
          {
            threadId: it.threadId,
            slug: it.slug,
            title: it.title,
            replies: it.comments,
            lastActivityAt: it.lastActivityAt,
          },
          forum,
          true,
        );
    }
    if (session.halted) summary.halted = true;

    // Nothing was polled: the source is unhealthy, stop before any listing or thread request.
    const unhealthy = (): boolean => summary.halted || summary.feedsPolled === 0;
    const failUnhealthy = async (): Promise<SdnLiveSummary> => {
      error = brief(session.lastFailure ?? 'no feed could be polled');
      return await close('FAILED');
    };
    if (unhealthy()) return await failUnhealthy();

    // 2. Discovery (at most one attempt per 24 h): the listing finds quiet threads RSS never lists.
    if (discoveryTick) {
      summary.discoveryAttemptedAt = now().toISOString();
      let discoveryOk = true;
      for (const forum of deps.forums.current) {
        for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
          if (deps.shouldStop()) {
            discoveryOk = false;
            break;
          }
          const body = await fetchBody(session, forumListingUrl(forum.node, page), 'sdn listing');
          if (body === null) {
            discoveryOk = false;
            break;
          }
          let listing;
          try {
            listing = parseForumListing(body);
          } catch {
            unparseable('sdn listing');
            discoveryOk = false;
            break;
          }
          session.noteSuccess();
          for (const t of listing.threads)
            await resolveAndUpsert(
              {
                threadId: t.threadId,
                slug: t.slug,
                title: t.title,
                replies: t.replies,
                lastActivityAt: t.lastActivityAt,
              },
              forum,
              false,
            );
          if (!listing.hasNext) break;
          if (page === MAX_LISTING_PAGES) discoveryOk = false;
        }
        if (summary.halted || session.halted) break;
      }
      summary.discovered = discoveryOk;
      if (!discoveryOk) incomplete = true;
      if (session.halted) summary.halted = true;
      if (summary.halted) return await failUnhealthy();
    }

    summary.threadsKnown = known.size;
    summary.threadsChanged = changed.size;
    const stale = now();
    summary.staleForumConfig =
      parsedCycles.length > 0 && parsedCycles.every((c) => c < cycleYearOf(stale, 'SECONDARY'));
    if (summary.staleForumConfig)
      log.warn('sdn-live: every thread title is from an earlier cycle; sdn-forums.json is probably stale');

    // 3. Select pending (non-archive, cursor behind the count), changed first, then most recent activity.
    const pending = [...known.values()]
      .filter(
        (t) =>
          !t.archive &&
          (t.repliesDone !== t.repliesSeen || forced.has(t.threadId)) &&
          (!t.parkedAt || (discoveryTick && t.parkedAt.getTime() <= since.getTime())),
      )
      .sort((a, b) => {
        const ca = changed.has(a.threadId) ? 0 : 1;
        const cb = changed.has(b.threadId) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0);
      });
    summary.pending = pending.length;

    const touched = new Map<string, TouchedCell>();
    const rollup = async (cells: TouchedCell[]): Promise<void> => {
      if (cells.length === 0) return;
      try {
        summary.rolledUp += await rollupEventCounts(prisma, {
          source: 'SDN',
          touched: cells,
        });
      } catch (e) {
        summary.rollupErrors++;
        incomplete = true;
        log.error(`sdn-live: roll-up failed: ${brief(e)}`);
      }
    };

    // 4. Process.
    if (!deps.ai.configured()) {
      summary.aiConfigured = false;
      incomplete = true;
    } else {
      const tdeps: ThreadDeps = {
        prisma,
        client: session,
        ai: deps.ai,
        budget,
        kind: 'live',
        secret: deps.secret,
        now,
        log,
        limits: {
          maxPages: deps.maxPages ?? DEFAULT_MAX_PAGES,
          maxLlmCalls: deps.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS,
        },
        state,
        shouldStop: deps.shouldStop,
      };
      for (const thread of pending) {
        if (deps.shouldStop()) {
          incomplete = true;
          break;
        }
        const res = await processThread(tdeps, thread);
        summary.eventsCreated += res.eventsCreated;
        summary.questionsCreated += res.questionsCreated;
        const c = res.counters;
        summary.batchesDropped += c.batchesDropped;
        summary.scannedCount += c.scannedCount;
        summary.filteredCount += c.filteredCount;
        summary.extractFailed += c.extractFailed;
        summary.rejected += c.rejected;
        summary.cursorLost += c.cursorLost;
        for (const cell of res.touched)
          touched.set(`${cell.schoolId}|${cell.program}|${cell.cycleYear}|${cell.date}`, cell);
        await rollup(res.touched);
        const mark = async (data: Record<string, unknown>): Promise<void> => {
          try {
            await prisma.medSdnThread.update({
              where: {
                threadId: thread.threadId,
              },
              data,
            });
          } catch (e) {
            log.warn(`sdn-live: could not update thread state: ${brief(e)}`);
          }
        };
        if (res.outcome === 'caught-up') {
          summary.processed++;
          if (thread.parkedAt || (thread.failCount ?? 0) > 0)
            await mark({
              parkedAt: null,
              failCount: 0,
            });
          continue;
        }
        incomplete = true;
        if (res.outcome === 'skipped') {
          // The thread is gone. Park it (cursor and counts untouched, so it resumes from its cursor); the
          // discovery tick retries it once the park is over 24 h old.
          summary.threadsSkipped++;
          await mark({
            parkedAt: now(),
          });
          continue;
        }
        if (res.outcome === 'failed') {
          summary.threadsFailed++;
          const fails = (thread.failCount ?? 0) + 1;
          await mark({
            failCount: fails,
            ...(fails >= MAX_THREAD_FAILURES
              ? {
                  parkedAt: now(),
                }
              : {}),
          });
          continue;
        }
        if (res.outcome === 'halted') {
          summary.halted = true;
          error = brief(session.lastFailure ?? 'source halted');
        }
        if (res.outcome === 'paused-budget') {
          // Work was done this run, so the outcome stays 'ran' and the interval window counts it.
          if (peakHit) summary.peakPaused = true;
          else summary.budgetPaused = true;
        }
        break; // stopped, ai-unavailable, paused-*, halted end the walk
      }
    }
    summary.pages = state.pages;
    summary.llmCalls = state.llmCalls;

    // 5. Self-healing roll-up: cells of events already stored for the threads seen this run, so a roll-up that
    // failed after an earlier insert is repaired. Diffing against stored counts makes unchanged cells a no-op.
    if (discoveryTick && seenThreads.size > 0) {
      try {
        const schoolIds = [...new Set([...seenThreads.values()].map((s) => s.schoolId))];
        const cycles = new Set([...seenThreads.values()].map((s) => `${s.schoolId}|${s.cycleYear}`));
        const stored = await prisma.medCycleEvent.findMany({
          where: {
            schoolId: {
              in: schoolIds,
            },
            source: 'SDN',
            program: {
              not: null,
            },
          },
        });
        const repair: TouchedCell[] = [];
        for (const e of stored) {
          if (e.program === null) continue;
          if (!cycles.has(`${e.schoolId}|${e.cycleYear}`)) continue;
          const date = e.occurredAt.toISOString().slice(0, 10);
          const key = `${e.schoolId}|${e.program}|${e.cycleYear}|${date}`;
          if (touched.has(key)) continue;
          touched.set(key, {
            schoolId: e.schoolId,
            program: e.program,
            cycleYear: e.cycleYear,
            date,
          });
          repair.push(touched.get(key)!);
        }
        await rollup(repair);
      } catch (e) {
        summary.rollupErrors++;
        incomplete = true;
        log.error(`sdn-live: roll-up repair failed: ${brief(e)}`);
      }
    }

    // 6. Cells the backfill could not roll up (its events are committed, its counts are short): retried here too,
    // once per discovery tick, so a backfill that is paused or finished does not leave them wrong.
    if (discoveryTick) {
      try {
        const repaired = await repairBackfillRollups(prisma);
        summary.rolledUp += repaired.rolledUp;
        if (repaired.failed) {
          summary.rollupErrors++;
          incomplete = true;
          log.error('sdn-live: backfill roll-up repair failed');
        }
      } catch (e) {
        summary.rollupErrors++;
        incomplete = true;
        log.error(`sdn-live: backfill roll-up repair failed: ${brief(e)}`);
      }
    }

    if (summary.halted) return await close('FAILED');
  } catch (e) {
    error = brief(e);
    log.error(`sdn-live: run failed: ${error}`);
    summary.pages = state.pages;
    summary.llmCalls = state.llmCalls;
    return await close('FAILED');
  }
  return await close(incomplete ? 'PARTIAL' : 'OK');

  async function close(status: SdnLiveSummary['status']): Promise<SdnLiveSummary> {
    summary.status = status;
    summary.requests = session.requests;
    finish();
    const { runId: _id, status: _s, ...counters } = summary;
    const stats: Record<string, unknown> = {
      ...counters,
    };
    if (summary.halted) stats.halted = true;
    try {
      await prisma.medSourceRun.update({
        where: {
          id: run.id,
        },
        data: {
          status,
          finishedAt: now(),
          stats,
          error,
        },
      });
    } catch (e) {
      log.error(`sdn-live: could not close run: ${brief(e)}`);
    }
    log.info(
      `sdn-live: ${status} feeds=${summary.feedsPolled} known=${summary.threadsKnown} changed=${summary.threadsChanged} pending=${summary.pending} processed=${summary.processed} pages=${summary.pages} calls=${summary.llmCalls} events=${summary.eventsCreated} rolledUp=${summary.rolledUp}`,
    );
    return finish();
  }
}

/** First back-off after a failed backfill run; doubles per consecutive failure, capped at 24 h (Q23). */
const BACKFILL_BACKOFF_BASE_MS = 3_600_000;
const BACKFILL_BACKOFF_CAP_MS = 24 * 3_600_000;

/**
 * Whether the SDN backfill should be queued by the live tick (rulings Q7, Q8, Q23). Signature for Task 11:
 * `sdnBackfillOwed(prisma, now, aiConfigured = true)` (positional, `now` a Date). False when AI is off, when the
 * newest backfill run finished the walk, when any recent run paused for this UTC month's budget, when it paused
 * for DeepSeek peak hours and it is still peak, or when the newest run failed (FAILED, or PARTIAL with real
 * failures) and is inside its back-off window (1 h, doubling per consecutive failed run, capped at 24 h; the
 * count is `stats.failStreak`), or when the newest run is waiting on parked threads and the earliest park is under
 * 24 h old (`stats.parkedUntil`). Cap, peak, budget, AI-off and parked waits are benign and never back off. True
 * otherwise, including before any run.
 */
export async function sdnBackfillOwed(prisma: MedPrisma, now: Date, aiConfigured = true): Promise<boolean> {
  if (!aiConfigured) return false;
  if (isDeepseekPeak(now)) return false; // nothing is queued at peak
  const recent = await prisma.medSourceRun.findMany({
    where: {
      source: 'SDN',
      job: 'sdn-backfill',
    },
    orderBy: {
      startedAt: 'desc',
    },
    take: 20,
  });
  // Newest first (the query asks for it; sorting here keeps the answer independent of the store).
  recent.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const latest = recent[0];
  if (!latest) return true;
  const statsOf = (r: { stats: unknown }): Record<string, unknown> =>
    r.stats !== null && typeof r.stats === 'object' ? (r.stats as Record<string, unknown>) : {};
  const stats = statsOf(latest);
  const cursor = stats.cursor as
    | {
        stage?: unknown;
      }
    | undefined;
  if ((cursor?.stage ?? stats.stage) === 'done') return false;
  // Waiting on parked threads (404 or repeated failures): benign, and not owed until the earliest park is 24 h old.
  if (stats.waitingOnParked === true && typeof stats.parkedUntil === 'string') {
    const until = Date.parse(stats.parkedUntil);
    if (Number.isFinite(until) && now.getTime() < until) return false;
  }
  // The newest run that carries a pausedMonth, so a later manual or failed run does not lose the pause.
  const month = now.toISOString().slice(0, 7);
  const paused = recent.map(statsOf).find((st) => typeof st.pausedMonth === 'string');
  if (paused?.pausedMonth === month) return false;
  if (stats.peakPaused === true && isDeepseekPeak(now)) return false;
  const failed =
    latest.status === 'FAILED' ||
    (latest.status === 'PARTIAL' && typeof stats.failStreak === 'number' && stats.failStreak > 0);
  if (failed) {
    const streak = typeof stats.failStreak === 'number' && stats.failStreak > 0 ? stats.failStreak : 1;
    const window = Math.min(BACKFILL_BACKOFF_BASE_MS * 2 ** (streak - 1), BACKFILL_BACKOFF_CAP_MS);
    const at = (latest.finishedAt ?? latest.startedAt) as Date | null | undefined;
    if (at && now.getTime() < at.getTime() + window) return false;
  }
  return true;
}
