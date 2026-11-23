/**
 * The `medschools.admit-forums` job: read Admit.org's school forums (one thread per school per cycle) eight times a day
 * and turn what members say about their own cycle into anonymous events, the way the SDN pipeline does for SDN.
 *
 * What it reads and how it stays small: one summary call (`getAllSchoolThreads`, three pages) lists every school's post
 * count; a thread is visited only when its count is past its persisted cursor, and then only from the cursor on (an
 * offset read that starts one post early, so the anchor is checked against a keyed hash). A run therefore costs a handful
 * of requests when little is new, never a re-read of the forums.
 *
 * Fetch at any hour, model off-peak only (owner 2026-11-23): at DeepSeek peak the run still looks (the summary pages) and
 * records each thread's count, which is the persisted "held" state (count past cursor, no post text kept anywhere), and
 * reads no posts; the next off-peak run reads the held range. Posts are fetched only when the model can run on them at
 * once, so nothing is fetched twice and nothing has to be stored.
 *
 * No duplicates: a post that is a copy of an SDN post is skipped (`isSdnMirror`); a native post's events key on the
 * member (`admit-events.ts`, the same key the tracker feed and the history write), so one member counts once per event
 * type per school per cycle whichever source saw them first; an anonymous post (no author id) falls back to a per-post key.
 *
 * Never throws. Nothing person-shaped is read out of the adapter, stored or logged: counters and hashes only.
 */
import { isDeepseekPeak } from '@/lib/ai/deepseek-peak';
import { cycleYearOf } from '../engine/cycle';
import { passesPrefilter } from '../engine/sdn-rules';
import { FORUM_PAGE_SIZE, createAdmitForumClient, type ForumPage, type ForumPost } from './adapters/admit';
import { commitAdmitEvents, type AdmitCandidate } from './admit-events';
import { ensureAdmitRekey } from './admit-rekey';
import { BudgetExhaustedError, SourceHaltedError, type PoliteClient, type PoliteHost } from './http';
import type { DailyBudget } from './request-budget';
import { rollupEventCounts, type TouchedCell } from './rollup-events';
import { ADMIT_FORUMS_MIN_INTERVAL_MS, brief, closeStaleRuns, lastRealRunWithin, recordAliasMiss } from './run-support';
import type { BudgetGate } from './sdn/budget';
import { chunkPosts, extractBatch, type ExtractedPost, type SdnAi } from './sdn/extract';
import { SOURCES } from './sources';
import type { Logger, MedAdmitForumThreadRow, MedPrisma } from './types';

export interface AdmitForumsDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  ai: SdnAi;
  /** The forums job's own share of the monthly model budget (`admit-forums-budget.ts`). */
  budget: BudgetGate;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** HTTP requests per run, the summary pages included (default 80). */
  maxRequests?: number;
  /** Model calls per run (default 60). */
  maxLlmCalls?: number;
  /** The job's own persisted DAILY request quota, one unit per request, beside the host budget every request spends. */
  quota?: DailyBudget;
}

export type AdmitForumsOutcome = 'ran' | 'skipped-min-interval' | 'held-peak';

export interface AdmitForumsSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  outcome: AdmitForumsOutcome;
  /** The forum year read (entry year minus one). */
  forumYear: number;
  threadsListed: number;
  /** Rows created for a school's thread seen for the first time. */
  threadsNew: number;
  /** Threads whose post count is past their cursor when the walk starts. */
  pending: number;
  /** Posts behind the cursor across the pending threads (the held backlog). */
  postsBehind: number;
  processed: number;
  threadsFailed: number;
  threadsParked: number;
  llmCalls: number;
  postsScanned: number;
  postsFiltered: number;
  /** Posts skipped because they are copies of SDN posts. */
  mirroredSkipped: number;
  eventsCreated: number;
  eventsMoved: number;
  /** Events whose member key was already stored (the tracker, the history or an earlier post got there first). */
  eventsExisting: number;
  rolledUp: number;
  misses: number;
  aliasMissErrors: number;
  extractFailed: number;
  batchesDropped: number;
  rejected: number;
  cursorLost: number;
  malformed: number;
  aiConfigured: boolean;
  budgetPaused: boolean;
  peakPaused: boolean;
  /** The run's request cap or the job's daily quota ended the walk. */
  requestsPaused: boolean;
  quotaSpent: boolean;
  halted: boolean;
  requests: number;
  durationMs: number;
}

const DEFAULT_MAX_REQUESTS = 80;
const DEFAULT_MAX_LLM_CALLS = 60;
const MAX_THREAD_FAILURES = 3;
const DAY_MS = 86_400_000;
/** Page-sized steps back when the cursor's anchor post is missing, before a thread is re-read from its start. */
const ANCHOR_STEP_BACKS = 2;

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Forum years (Admit names a thread by its start year) this run reads, current first. The current one is the entry year
 * of the cycle by the secondary rule (June 1) minus one. The previous cycle's threads are still read until the latest
 * rollover of the event types, decisions on September 1, so from June 1 through August 31 both are listed: summer
 * decisions and waitlist movement belong to the class that ends that August. Both share the run's one request cap.
 */
export function forumYearsFor(at: Date): number[] {
  const current = cycleYearOf(at, 'SECONDARY') - 1;
  return cycleYearOf(at, 'ACCEPTANCE') <= current ? [current, current - 1] : [current];
}

type ThreadOutcome =
  'caught-up' | 'paused-budget' | 'paused-cap' | 'paused-requests' | 'ai-unavailable' | 'failed' | 'stopped' | 'halted';

interface ThreadCounters {
  scanned: number;
  filtered: number;
  mirrored: number;
  created: number;
  moved: number;
  existing: number;
  rejected: number;
  extractFailed: number;
  batchesDropped: number;
  cursorLost: number;
  malformed: number;
}

export async function runAdmitForums(
  deps: AdmitForumsDeps,
  opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
): Promise<AdmitForumsSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const maxRequests = deps.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const maxLlmCalls = deps.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS;
  const t0 = now().getTime();
  const forumYears = forumYearsFor(now());
  const forumYear = forumYears[0]!;
  const summary: AdmitForumsSummary = {
    runId: '',
    status: 'FAILED',
    outcome: 'ran',
    forumYear,
    threadsListed: 0,
    threadsNew: 0,
    pending: 0,
    postsBehind: 0,
    processed: 0,
    threadsFailed: 0,
    threadsParked: 0,
    llmCalls: 0,
    postsScanned: 0,
    postsFiltered: 0,
    mirroredSkipped: 0,
    eventsCreated: 0,
    eventsMoved: 0,
    eventsExisting: 0,
    rolledUp: 0,
    misses: 0,
    aliasMissErrors: 0,
    extractFailed: 0,
    batchesDropped: 0,
    rejected: 0,
    cursorLost: 0,
    malformed: 0,
    aiConfigured: true,
    budgetPaused: false,
    peakPaused: false,
    requestsPaused: false,
    quotaSpent: false,
    halted: false,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): AdmitForumsSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  if (deps.secret.length < 16) {
    log.error('admit-forums: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped');
    return finish();
  }
  // The events share the ADMIT member keys: the one-time re-key must precede the first write under them.
  if (!(await ensureAdmitRekey(prisma, log, now))) {
    log.error('admit-forums: the one-time Admit re-key has not completed; run skipped');
    return finish();
  }

  await closeStaleRuns(prisma, 'ADMIT', 'admit-forums', now, log);
  let run: { id: string };
  try {
    run = await prisma.medSourceRun.create({
      data: { source: 'ADMIT', job: 'admit-forums', trigger: opts.trigger, status: 'RUNNING', startedAt: now() },
    });
  } catch (e) {
    log.error(`admit-forums: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session({
    spacingMs: SOURCES.ADMIT.backfillSpacingMs,
    jitterMs: SOURCES.ADMIT.backfillJitterMs ?? 0,
  });
  // The job's own daily quota: one unit per request, taken before it, so a spent day ends the run like a halt.
  let quotaSpent = false;
  // Logical requests this run made (the cap counts these, not the host's retries or its robots.txt fetch).
  let made = 0;
  const metered: PoliteClient = {
    get: (path, o) => session.get(path, o),
    async post(path, body, o) {
      if (deps.quota && !(await deps.quota.take())) {
        quotaSpent = true;
        throw new BudgetExhaustedError('admit-forums daily request quota spent');
      }
      made++;
      return session.post(path, body, o);
    },
    noteSuccess: () => session.noteSuccess(),
    noteFailure: (r) => session.noteFailure(r),
    get halted() {
      return session.halted || quotaSpent;
    },
    get requests() {
      return session.requests;
    },
    get lastFailure() {
      return session.lastFailure;
    },
  };
  const client = createAdmitForumClient(metered, { secret: deps.secret });
  let error: string | null = null;
  let incomplete = false;

  try {
    // Once per run window: a restart, a duplicate trigger or a mistyped cron cannot run this more than about every 2.5 h.
    if (opts.trigger !== 'MANUAL') {
      let recent = true; // a ledger read error fails closed: a background job spends unattended
      try {
        recent = await lastRealRunWithin(prisma, 'ADMIT', 'admit-forums', ADMIT_FORUMS_MIN_INTERVAL_MS, now());
      } catch (e) {
        log.warn(`admit-forums: could not read the last run: ${brief(e)}`);
      }
      if (recent) {
        summary.outcome = 'skipped-min-interval';
        return await close('OK');
      }
    }

    const aliases = await prisma.medSchoolAlias.findMany({ where: { source: 'ADMIT' } });
    const active = new Set((await prisma.medSchool.findMany({ where: { active: true } })).map((s) => s.id));
    const schoolBySlug = new Map(aliases.map((a) => [a.sourceKey, a.schoolId]));
    const slugBySchool = new Map(aliases.map((a) => [a.schoolId, a.sourceKey]));
    const missed = new Set<string>();

    // 1. The summary: every school's thread and post count (about three requests), at any hour.
    // Keyed by school and cycle: from June 1 to August 31 a school has two threads in play.
    const rows = await prisma.medAdmitForumThread.findMany({
      where: { cycleYear: { in: forumYears.map((y) => y + 1) } },
    });
    const bySchool = new Map<string, MedAdmitForumThreadRow>(rows.map((r) => [`${r.schoolId}:${r.cycleYear}`, r]));
    for (const year of forumYears) {
      const listing = await client.listThreads(year);
      summary.threadsListed += listing.threads.length;
      summary.malformed += listing.malformed;
      if (listing.malformed > 0) incomplete = true;
      const cycleYear = year + 1;
      for (const t of listing.threads) {
        const schoolId = schoolBySlug.get(t.slug);
        if (schoolId === undefined) {
          if (!missed.has(t.slug)) {
            missed.add(t.slug);
            try {
              if (await recordAliasMiss(prisma, 'ADMIT', t.slug, now)) summary.misses++;
            } catch (e) {
              summary.aliasMissErrors++;
              log.warn(`admit-forums: alias miss write failed: ${brief(e)}`);
            }
          }
          continue;
        }
        if (!active.has(schoolId)) continue;
        const key = `${schoolId}:${cycleYear}`;
        const prior = bySchool.get(key);
        if (!prior) {
          if (t.commentCount === 0) continue;
          const row = await prisma.medAdmitForumThread.create({
            data: {
              schoolId,
              cycleYear,
              remoteCount: t.commentCount,
              cursorOffset: 0,
              cursorPostHash: null,
              postsProcessed: 0,
              failCount: 0,
            },
          });
          bySchool.set(key, row);
          summary.threadsNew++;
          continue;
        }
        if (prior.remoteCount !== t.commentCount) {
          const row = await prisma.medAdmitForumThread.update({
            where: { id: prior.id },
            data: { remoteCount: t.commentCount },
          });
          bySchool.set(key, { ...prior, ...row, remoteCount: t.commentCount });
        }
      }
    }

    // 2. Threads whose count is past their cursor, the smallest backlog first (cheap wins), parked ones after 24 h.
    const parkOver = now().getTime() - DAY_MS;
    const pending = [...bySchool.values()]
      .filter((t) => t.remoteCount > t.cursorOffset && (!t.parkedAt || t.parkedAt.getTime() <= parkOver))
      .sort((a, b) => a.remoteCount - a.cursorOffset - (b.remoteCount - b.cursorOffset));
    summary.pending = pending.length;
    summary.postsBehind = pending.reduce((n, t) => n + (t.remoteCount - t.cursorOffset), 0);

    // 3. Fetching posts only when the model can follow at once. At DeepSeek peak the counts above are the held state.
    if (isDeepseekPeak(now())) {
      summary.outcome = 'held-peak';
      summary.peakPaused = true;
      return await close('OK'); // a benign hold, not a failure: the count past the cursor is the persisted state
    }
    if (!deps.ai.configured()) {
      summary.aiConfigured = false;
      return await close(summary.pending > 0 ? 'PARTIAL' : 'OK');
    }

    // The model is refused at peak even if the run crosses into it (and for a manual run).
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

    const state = { llmCalls: 0 };
    for (const thread of pending) {
      if (deps.shouldStop()) {
        incomplete = true;
        break;
      }
      const slug = slugBySchool.get(thread.schoolId);
      if (slug === undefined) continue;
      const res = await processThread(
        {
          prisma,
          client,
          ai: deps.ai,
          budget,
          secret: deps.secret,
          forumYear: thread.cycleYear - 1,
          maxLlmCalls,
          requestsLeft: () => maxRequests - made,
          shouldStop: deps.shouldStop,
          state,
          log,
          now,
          isHalted: () => metered.halted,
        },
        thread,
        slug,
      );
      summary.postsScanned += res.counters.scanned;
      summary.postsFiltered += res.counters.filtered;
      summary.mirroredSkipped += res.counters.mirrored;
      summary.eventsCreated += res.counters.created;
      summary.eventsMoved += res.counters.moved;
      summary.eventsExisting += res.counters.existing;
      summary.rejected += res.counters.rejected;
      summary.extractFailed += res.counters.extractFailed;
      summary.batchesDropped += res.counters.batchesDropped;
      summary.cursorLost += res.counters.cursorLost;
      summary.malformed += res.counters.malformed;
      if (res.touched.length > 0) {
        try {
          summary.rolledUp += await rollupEventCounts(prisma, { source: 'ADMIT', touched: res.touched });
        } catch (e) {
          incomplete = true;
          log.error(`admit-forums: roll-up failed: ${brief(e)}`);
        }
      }
      const mark = async (data: Record<string, unknown>): Promise<void> => {
        try {
          await prisma.medAdmitForumThread.update({ where: { id: thread.id }, data });
        } catch (e) {
          log.warn(`admit-forums: could not update thread state: ${brief(e)}`);
        }
      };
      if (res.outcome === 'caught-up') {
        summary.processed++;
        if (thread.parkedAt || thread.failCount > 0) await mark({ parkedAt: null, failCount: 0 });
        continue;
      }
      incomplete = true;
      if (res.outcome === 'failed') {
        summary.threadsFailed++;
        const fails = thread.failCount + 1;
        if (fails >= MAX_THREAD_FAILURES) summary.threadsParked++;
        await mark({ failCount: fails, ...(fails >= MAX_THREAD_FAILURES ? { parkedAt: now() } : {}) });
        continue;
      }
      if (res.outcome === 'halted') {
        summary.halted = true;
        error = brief(session.lastFailure ?? 'source halted');
      }
      if (res.outcome === 'paused-budget') {
        if (peakHit) summary.peakPaused = true;
        else summary.budgetPaused = true;
      }
      if (res.outcome === 'paused-requests') summary.requestsPaused = true;
      break; // stopped, ai-unavailable, paused-*, halted end the walk
    }
    summary.llmCalls = state.llmCalls;
    if (pending.length > summary.processed + summary.threadsFailed) incomplete = true;
    if (summary.halted) return await close('FAILED');
  } catch (e) {
    if (e instanceof SourceHaltedError || session.halted || quotaSpent) {
      summary.halted = true;
      error = brief(session.lastFailure ?? (e instanceof Error ? e.message : 'source halted'));
      return await close(summary.threadsListed > 0 ? 'PARTIAL' : 'FAILED');
    }
    error = brief(e);
    log.error(`admit-forums: run failed: ${error}`);
    return await close('FAILED');
  }
  return await close(incomplete ? 'PARTIAL' : 'OK');

  async function close(status: AdmitForumsSummary['status']): Promise<AdmitForumsSummary> {
    summary.status = status;
    summary.requests = session.requests;
    summary.quotaSpent = quotaSpent;
    finish();
    const { runId: _id, status: _s, ...counters } = summary;
    try {
      await prisma.medSourceRun.update({
        where: { id: run.id },
        data: { status, finishedAt: now(), stats: counters, error },
      });
    } catch (e) {
      log.error(`admit-forums: could not close run: ${brief(e)}`);
    }
    log.info(
      `admit-forums: ${status} outcome=${summary.outcome} listed=${summary.threadsListed} pending=${summary.pending} behind=${summary.postsBehind} processed=${summary.processed} scanned=${summary.postsScanned} mirrored=${summary.mirroredSkipped} calls=${summary.llmCalls} created=${summary.eventsCreated} existing=${summary.eventsExisting} rolledUp=${summary.rolledUp} requests=${summary.requests}`,
    );
    return finish();
  }
}

interface ThreadDeps {
  prisma: MedPrisma;
  client: ReturnType<typeof createAdmitForumClient>;
  ai: SdnAi;
  budget: BudgetGate;
  secret: string;
  forumYear: number;
  maxLlmCalls: number;
  requestsLeft(): number;
  shouldStop(): boolean;
  state: { llmCalls: number };
  log: Logger;
  now(): Date;
  isHalted(): boolean;
}

interface ThreadResult {
  outcome: ThreadOutcome;
  counters: ThreadCounters;
  touched: TouchedCell[];
}

/**
 * Walks one thread from its cursor. Each chunk's events, the cursor and the post counters are written in one
 * transaction, so a failure keeps the cursor at the last committed chunk and repeats nothing that was paid for.
 */
async function processThread(deps: ThreadDeps, thread: MedAdmitForumThreadRow, slug: string): Promise<ThreadResult> {
  const { prisma, client, ai, budget, log, state } = deps;
  const counters: ThreadCounters = {
    scanned: 0,
    filtered: 0,
    mirrored: 0,
    created: 0,
    moved: 0,
    existing: 0,
    rejected: 0,
    extractFailed: 0,
    batchesDropped: 0,
    cursorLost: 0,
    malformed: 0,
  };
  const touched = new Map<string, TouchedCell>();
  const finish = (outcome: ThreadOutcome): ThreadResult => ({ outcome, counters, touched: [...touched.values()] });

  let capHit = false;
  const beforeCall = async (): Promise<boolean> => {
    if (state.llmCalls >= deps.maxLlmCalls) {
      capHit = true;
      return false;
    }
    if (!(await budget.allow('live'))) return false;
    state.llmCalls++;
    return true;
  };

  // `consumed` is the number of posts already processed; `anchor` is the keyed hash of the last of them.
  let consumed = thread.cursorOffset;
  let anchor = thread.cursorPostHash;
  let probe = anchor && consumed > 0 ? consumed - 1 : 0;
  let stepBacks = 0;

  async function commit(
    page: ForumPage,
    base: number,
    span: ForumPost[],
    results: Map<ForumPost, ExtractedPost>,
  ): Promise<void> {
    const last = span[span.length - 1];
    if (!last) return;
    const candidates: AdmitCandidate[] = [];
    for (const post of span) {
      const r = results.get(post);
      if (!r || post.mirrored) continue;
      for (const e of r.events) {
        candidates.push({
          schoolId: thread.schoolId,
          cycleYear: thread.cycleYear,
          program: e.program,
          eventType: e.type,
          occurredAt: e.occurredAt,
          dedupeHash: post.eventKey(e.type, thread.schoolId, thread.cycleYear, isoDay(e.occurredAt)),
        });
      }
    }
    const res = await prisma.$transaction(async (tx) => {
      const out = await commitAdmitEvents(tx, candidates);
      await tx.medAdmitForumThread.update({
        where: { id: thread.id },
        data: {
          cursorOffset: base + span.length,
          cursorPostHash: last.postHash,
          postsProcessed: { increment: span.length },
          remoteCount: Math.max(page.commentCount, base + span.length),
          lastPostAt: last.postedAt,
        },
      });
      return out;
    });
    counters.created += res.created;
    counters.moved += res.moved;
    counters.existing += res.existing;
    for (const c of res.touched) touched.set(`${c.schoolId}|${c.program}|${c.cycleYear}|${c.date}`, c);
    consumed = base + span.length;
    anchor = last.postHash;
  }

  async function extractChunk(
    chunk: ForumPost[],
    page: ForumPage,
  ): Promise<{ results: Map<ForumPost, ExtractedPost>; completed: ForumPost[]; stop?: 'outage' | 'budget' }> {
    const ctx = { cycleYear: thread.cycleYear, containsHandle: page.containsHandle };
    const results = new Map<ForumPost, ExtractedPost>();
    const addRejected = (r: { schema: number; badRef: number; badDate: number; badQuestion: number }): void => {
      counters.rejected += r.schema + r.badRef + r.badDate + r.badQuestion;
    };
    const whole = await extractBatch(ai, chunk, ctx, beforeCall);
    if (whole.ok) {
      addRejected(whole.rejected);
      for (const [ref, r] of whole.byRef) {
        const post = chunk[ref];
        if (post) results.set(post, r);
      }
      return { results, completed: chunk };
    }
    if (whole.reason !== 'schema') return { results, completed: [], stop: whole.reason };
    // A poisoned chunk is retried post by post; one that still fails is skipped and the cursor moves past it.
    counters.batchesDropped++;
    const completed: ForumPost[] = [];
    for (const post of chunk) {
      const one = await extractBatch(ai, [post], ctx, beforeCall);
      if (one.ok) {
        addRejected(one.rejected);
        const r = one.byRef.get(0);
        if (r) results.set(post, r);
      } else if (one.reason === 'schema') {
        counters.extractFailed++;
      } else {
        return { results, completed, stop: one.reason };
      }
      completed.push(post);
    }
    return { results, completed };
  }

  for (;;) {
    if (deps.shouldStop()) return finish('stopped');
    if (deps.isHalted()) return finish('halted');
    if (deps.requestsLeft() <= 0) return finish('paused-requests');

    let page: ForumPage;
    try {
      page = await client.fetchPosts(slug, deps.forumYear, probe);
    } catch (e) {
      if (e instanceof SourceHaltedError || deps.isHalted()) return finish('halted');
      log.warn('admit-forums: thread page failed');
      return finish('failed');
    }
    counters.malformed += page.malformed;

    // Find where the unread posts start: just after the anchor (found at the probe offset, or one page earlier).
    let base = 0;
    let start = 0;
    if (anchor !== null && consumed > 0) {
      const idx = page.posts.findIndex((p) => p.postHash === anchor);
      if (idx < 0) {
        // The anchor is gone (posts removed before it). Look one page earlier, twice, then re-read from the start:
        // the member keys make a repeat harmless, it only costs a re-extraction.
        if (stepBacks < ANCHOR_STEP_BACKS && probe > 0) {
          stepBacks++;
          probe = Math.max(0, probe - FORUM_PAGE_SIZE);
          continue;
        }
        counters.cursorLost++;
        consumed = 0;
        anchor = null;
        probe = 0;
        stepBacks = 0;
        continue;
      }
      base = probe + idx + 1;
      start = idx + 1;
    }
    const fresh = page.posts.slice(start);
    counters.scanned += fresh.length;
    counters.mirrored += fresh.filter((p) => p.mirrored).length;
    const survivors = fresh.filter((p) => !p.mirrored && passesPrefilter(p.text));
    counters.filtered += fresh.filter((p) => !p.mirrored).length - survivors.length;

    // Spans of `fresh`, each ending at the last survivor of a model chunk, so the cursor also passes the posts the
    // prefilter dropped; a tail of dropped posts commits as a cursor-only span.
    const spans: Array<{ span: ForumPost[]; chunk: ForumPost[]; at: number }> = [];
    let from = 0;
    for (const chunk of chunkPosts(survivors)) {
      const lastIdx = fresh.indexOf(chunk[chunk.length - 1] as ForumPost);
      spans.push({ span: fresh.slice(from, lastIdx + 1), chunk, at: from });
      from = lastIdx + 1;
    }
    if (from < fresh.length) spans.push({ span: fresh.slice(from), chunk: [], at: from });

    for (const { span, chunk, at } of spans) {
      if (deps.shouldStop()) return finish('stopped');
      let results = new Map<ForumPost, ExtractedPost>();
      if (chunk.length > 0) {
        const out = await extractChunk(chunk, page);
        results = out.results;
        if (out.stop) {
          // Commit the contiguous prefix already paid for before pausing.
          const lastDone = out.completed[out.completed.length - 1];
          if (lastDone) {
            try {
              await commit(page, base + at, span.slice(0, span.indexOf(lastDone) + 1), results);
            } catch {
              log.error('admit-forums: chunk write failed; cursor kept');
              return finish('failed');
            }
          }
          if (out.stop === 'outage') return finish('ai-unavailable');
          return finish(capHit ? 'paused-cap' : 'paused-budget');
        }
      }
      try {
        await commit(page, base + at, span, results);
      } catch {
        log.error('admit-forums: chunk write failed; cursor kept');
        return finish('failed');
      }
    }

    // A short page, or every post the server counts, is the end of the thread.
    const total = base + fresh.length;
    if (page.posts.length < FORUM_PAGE_SIZE || total >= page.commentCount || fresh.length === 0) {
      if (fresh.length === 0 || total !== thread.remoteCount) {
        try {
          await prisma.medAdmitForumThread.update({
            where: { id: thread.id },
            data: { remoteCount: Math.max(page.commentCount, consumed) },
          });
        } catch {
          log.error('admit-forums: could not mark thread done');
          return finish('failed');
        }
      }
      return finish('caught-up');
    }
    probe = consumed - 1;
    stepBacks = 0;
  }
}
