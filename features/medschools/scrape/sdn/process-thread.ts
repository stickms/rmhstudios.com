/**
 * SDN thread processor: walks one thread's pages from the stored hash cursor, sends prefilter survivors to the
 * model in chunks and commits each chunk (its events, its questions and the cursor) in one transaction.
 *
 * Anonymization: the raw post id never reaches this module (the parser hands back HMAC hashes), and nothing
 * written or logged here carries an author, a handle, a post id or any post text. Counters are numbers only.
 */
import { dedupeHash } from '../../engine/dedupe';
import { normalizeQuestion, passesPrefilter } from '../../engine/sdn-rules';
import type { MedProgram } from '../../engine/types';
import { SdnPageError, assertPage, canonicalThreadUrl, parseThreadPage, threadPageUrl } from '../adapters/sdn';
import type { ParsedThreadPage, SdnPost } from '../adapters/sdn';
import { SourceHaltedError, type PoliteClient } from '../http';
import type { TouchedCell } from '../rollup-events';
import type { Logger, MedPrisma, MedSdnThreadRow } from '../types';
import type { BudgetGate } from './budget';
import { chunkPosts, extractBatch, type ExtractedPost, type ExtractRejected, type SdnAi } from './extract';
import type { PromptSink } from './secondaries';

export interface RunLimits {
  maxPages: number;
  maxLlmCalls: number;
}

export interface RunState {
  pages: number;
  llmCalls: number;
}

export interface ThreadDeps {
  prisma: MedPrisma;
  client: PoliteClient;
  ai: SdnAi;
  budget: BudgetGate;
  kind: 'live' | 'backfill';
  secret: string;
  now(): Date;
  log: Logger;
  limits: RunLimits;
  state: RunState;
  shouldStop(): boolean;
  /**
   * The secondary-prompt extractor (secondaries plan, Task 10): a second model call on a chunk the event extraction has
   * already committed. Absent, the thread's behaviour is exactly what it was without it.
   */
  prompts?: PromptSink;
}

/**
 * `ai-unavailable` stores nothing and keeps the cursor (the run is PARTIAL); `paused-budget` and `paused-cap`
 * keep the cursor at the last committed chunk; `skipped` is a thread that is gone (404), not a failure.
 */
export type ThreadOutcome =
  'caught-up' | 'paused-budget' | 'paused-cap' | 'ai-unavailable' | 'failed' | 'stopped' | 'halted' | 'skipped';

/** Numbers only, so a stats blob built from it can never carry a person or a post. */
export interface ThreadCounters {
  pages: number;
  scannedCount: number;
  filteredCount: number;
  llmCalls: number;
  /** Chunks whose model output failed the schema twice (each is then retried post by post). */
  batchesDropped: number;
  /** Single posts that still failed after the per-post retry: skipped, cursor advanced past them (Q22). */
  extractFailed: number;
  rejected: number;
  cursorLost: number;
}

export interface ThreadResult {
  outcome: ThreadOutcome;
  eventsCreated: number;
  questionsCreated: number;
  /** Secondary-prompt observations created or changed by the sink, and candidates it rejected (numbers only). */
  promptsStored: number;
  promptsRejected: number;
  touched: TouchedCell[];
  counters: ThreadCounters;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

type ChunkStop = 'outage' | 'budget' | 'failed';

export async function processThread(deps: ThreadDeps, thread: MedSdnThreadRow): Promise<ThreadResult> {
  const { prisma, client, ai, budget, kind, secret, log, limits, state } = deps;
  const hashPostId = (id: string): string => dedupeHash(secret, 'SDN', `post:${id}`);

  const counters: ThreadCounters = {
    pages: 0,
    scannedCount: 0,
    filteredCount: 0,
    llmCalls: 0,
    batchesDropped: 0,
    extractFailed: 0,
    rejected: 0,
    cursorLost: 0,
  };
  let eventsCreated = 0;
  let questionsCreated = 0;
  let promptsStored = 0;
  let promptsRejected = 0;
  /** Set when the sink says stop (peak, its own budget, an outage, the run's call cap): it asks no more this thread. */
  let sinkOff = false;
  const touched = new Map<string, TouchedCell>();
  const finish = (outcome: ThreadOutcome): ThreadResult => ({
    outcome,
    eventsCreated,
    questionsCreated,
    promptsStored,
    promptsRejected,
    touched: [...touched.values()],
    counters,
  });

  // Why the model gate said no: the run's call cap or the monthly money budget.
  let capHit = false;
  const beforeCall = async (): Promise<boolean> => {
    if (state.llmCalls >= limits.maxLlmCalls) {
      capHit = true;
      return false;
    }
    if (!(await budget.allow(kind))) return false;
    state.llmCalls++;
    counters.llmCalls++;
    return true;
  };

  /**
   * The secondary-prompt sink on a chunk whose events and cursor are already committed, so whatever happens here can never
   * lose an event or move the cursor. Its model calls count against the run's cap (`state.llmCalls`) but not against this
   * thread's event counters. A failure is logged as a static line and the thread carries on.
   */
  async function extractPrompts(chunk: SdnPost[], parsed: ParsedThreadPage): Promise<void> {
    const sink = deps.prompts;
    if (!sink || sinkOff || !chunk.some((p) => sink.wants(p))) return;
    try {
      const r = await sink.extract(chunk, {
        cycleYear: thread.cycleYear,
        schoolId: thread.schoolId,
        threadUrl: canonicalThreadUrl(thread.slug, thread.threadId),
        kind,
        containsHandle: parsed.containsHandle,
        reserve: () => {
          if (state.llmCalls >= limits.maxLlmCalls) return false;
          state.llmCalls++;
          return true;
        },
      });
      promptsStored += r.stored;
      promptsRejected += r.rejected;
      if (r.stop) sinkOff = true;
    } catch {
      sinkOff = true;
      log.warn('sdn thread: secondary prompts failed; events and cursor kept');
    }
  }

  /** Commits one chunk: events, questions and the cursor together, or nothing. */
  async function commit(page: number, span: SdnPost[], results: Map<SdnPost, ExtractedPost>): Promise<void> {
    const events: Array<Record<string, unknown>> = [];
    const questions = new Map<string, Record<string, unknown>>();
    const cells = new Map<string, TouchedCell>();
    const keys = new Set<string>();
    const scope = `${thread.schoolId}:${thread.cycleYear}`;
    // Post order, so the first report of a member wins whatever order the model answered in.
    const ordered = span.filter((p) => results.has(p));
    for (const post of ordered) {
      const r = results.get(post) as ExtractedPost;
      for (const e of r.events) {
        const day = isoDay(e.occurredAt);
        const key = post.eventKey(e.type, scope, day);
        // A repeat of an earlier report (same member, type, school, cycle) is dropped here and by the unique
        // dedupeHash; it neither inserts nor touches a count cell.
        if (keys.has(key)) continue;
        keys.add(key);
        events.push({
          schoolId: thread.schoolId,
          cycleYear: thread.cycleYear,
          program: e.program,
          eventType: e.type,
          occurredAt: e.occurredAt,
          source: 'SDN',
          dedupeHash: key,
          inState: e.inState,
        });
        if (e.program) {
          const cell: TouchedCell = {
            schoolId: thread.schoolId,
            program: e.program as MedProgram,
            cycleYear: thread.cycleYear,
            date: day,
          };
          cells.set(`${cell.program}|${cell.date}`, cell);
        }
      }
      for (const text of r.questions) {
        const h = dedupeHash(secret, 'SDN', `q:${thread.schoolId}:${normalizeQuestion(text)}`);
        if (!questions.has(h))
          questions.set(h, {
            schoolId: thread.schoolId,
            text,
            source: 'SDN',
            votes: null,
            cycleYear: thread.cycleYear,
            dedupeHash: h,
          });
      }
    }
    const last = span[span.length - 1];
    if (!last) return;
    const counts = await prisma.$transaction(async (tx) => {
      const ev = events.length
        ? await tx.medCycleEvent.createMany({
            data: events,
            skipDuplicates: true,
          })
        : {
            count: 0,
          };
      const qs = questions.size
        ? await tx.medInterviewQuestion.createMany({
            data: [...questions.values()],
            skipDuplicates: true,
          })
        : {
            count: 0,
          };
      await tx.medSdnThread.update({
        where: {
          threadId: thread.threadId,
        },
        data: {
          cursorPage: page,
          cursorPostHash: last.postHash,
          postsProcessed: {
            increment: span.length,
          },
        },
      });
      return {
        ev: ev.count,
        qs: qs.count,
      };
    });
    eventsCreated += counts.ev;
    questionsCreated += counts.qs;
    for (const [k, c] of cells) touched.set(`${thread.schoolId}|${k}`, c);
  }

  /**
   * One chunk through the model. A poisoned chunk is retried per post (Q22). An outage or budget stop partway
   * through the per-post retry returns `stop` together with the contiguous prefix already extracted
   * (`completed`, in order), so the caller can commit what was paid for.
   */
  async function extractChunk(
    chunk: SdnPost[],
    parsed: ParsedThreadPage,
  ): Promise<{
    results: Map<SdnPost, ExtractedPost>;
    completed: SdnPost[];
    stop?: ChunkStop;
  }> {
    const ctx = {
      cycleYear: thread.cycleYear,
      containsHandle: parsed.containsHandle,
    };
    const results = new Map<SdnPost, ExtractedPost>();
    const addRejected = (r: ExtractRejected): void => {
      counters.rejected += r.schema + r.badRef + r.badDate + r.badQuestion;
    };
    const whole = await extractBatch(ai, chunk, ctx, beforeCall);
    if (whole.ok) {
      addRejected(whole.rejected);
      for (const [ref, r] of whole.byRef) {
        const post = chunk[ref];
        if (post) results.set(post, r);
      }
      return {
        results,
        completed: chunk,
      };
    }
    if (whole.reason !== 'schema')
      return {
        results,
        completed: [],
        stop: whole.reason,
      };
    counters.batchesDropped++;
    const completed: SdnPost[] = [];
    for (const post of chunk) {
      const one = await extractBatch(ai, [post], ctx, beforeCall);
      if (one.ok) {
        addRejected(one.rejected);
        const r = one.byRef.get(0);
        if (r) results.set(post, r);
      } else if (one.reason === 'schema') {
        counters.extractFailed++;
      } else {
        return {
          results,
          completed,
          stop: one.reason,
        };
      }
      completed.push(post);
    }
    return {
      results,
      completed,
    };
  }

  let page = Math.max(1, thread.cursorPage);
  let hash = thread.cursorPostHash;

  for (;;) {
    if (deps.shouldStop()) return finish('stopped');
    if (state.pages >= limits.maxPages) return finish('paused-cap');

    state.pages++;
    counters.pages++;
    let parsed: ParsedThreadPage;
    try {
      const res = await client.get(threadPageUrl(thread.slug, thread.threadId, page));
      let body: string;
      try {
        body = assertPage(res, client, 'sdn thread page');
      } catch (e) {
        // assertPage already counted what the host did not (a challenge); never count an SdnPageError twice (Q21).
        if (e instanceof SdnPageError && e.status === 404) return finish('skipped');
        throw e;
      }
      try {
        parsed = parseThreadPage(body, hashPostId);
      } catch (e) {
        // A 200 that is not a thread page: the host saw success, so this is the one place we count it.
        if (e instanceof SdnPageError) client.noteFailure('sdn thread page: unparseable');
        throw e;
      }
      client.noteSuccess();
    } catch (e) {
      if (e instanceof SourceHaltedError || client.halted) return finish('halted');
      log.warn(`sdn thread: page ${page} failed (${e instanceof SdnPageError ? 'page' : 'error'})`);
      return finish('failed');
    }

    // The server answers a page past the last with the last page's content; stop walking at lastPage.
    if (page > parsed.lastPage) page = parsed.lastPage;

    const idx = hash ? parsed.posts.findIndex((p) => p.postHash === hash) : -1;
    if (hash && idx < 0) {
      // The cursor post is gone. Deleting earlier posts can pull the cursor's neighbours back onto the previous
      // page, so reprocess from one page earlier (event and question hashes keep the repeat harmless).
      counters.cursorLost++;
      if (page > 1) {
        page--;
        hash = null;
        continue;
      }
    }
    const fresh = idx >= 0 ? parsed.posts.slice(idx + 1) : parsed.posts;
    counters.scannedCount += fresh.length;
    const survivors = fresh.filter((p) => passesPrefilter(p.text));
    counters.filteredCount += fresh.length - survivors.length;

    // Spans of `fresh`, each ending at the last survivor of a model chunk, so the cursor also passes the
    // posts the prefilter dropped; a tail of dropped posts commits as a cursor-only span.
    let start = 0;
    const spans: Array<{
      span: SdnPost[];
      chunk: SdnPost[];
    }> = [];
    for (const chunk of chunkPosts(survivors)) {
      const lastIdx = fresh.indexOf(chunk[chunk.length - 1] as SdnPost);
      spans.push({
        span: fresh.slice(start, lastIdx + 1),
        chunk,
      });
      start = lastIdx + 1;
    }
    if (start < fresh.length)
      spans.push({
        span: fresh.slice(start),
        chunk: [],
      });

    for (const { span, chunk } of spans) {
      if (deps.shouldStop()) return finish('stopped');
      let results = new Map<SdnPost, ExtractedPost>();
      if (chunk.length > 0) {
        const out = await extractChunk(chunk, parsed);
        results = out.results;
        if (out.stop) {
          // Commit the contiguous prefix already paid for before pausing.
          const lastDone = out.completed[out.completed.length - 1];
          if (lastDone) {
            const prefix = span.slice(0, span.indexOf(lastDone) + 1);
            try {
              await commit(page, prefix, results);
            } catch {
              log.error('sdn thread: chunk write failed; cursor kept');
              return finish('failed');
            }
          }
          if (out.stop === 'outage') return finish('ai-unavailable');
          return finish(capHit ? 'paused-cap' : 'paused-budget');
        }
      }
      try {
        await commit(page, span, results);
      } catch {
        log.error('sdn thread: chunk write failed; cursor kept');
        return finish('failed');
      }
      if (chunk.length > 0) await extractPrompts(chunk, parsed);
    }

    if (page < parsed.lastPage) {
      page++;
      hash = null;
      continue;
    }
    break;
  }

  if (thread.repliesDone !== thread.repliesSeen) {
    try {
      await prisma.medSdnThread.update({
        where: {
          threadId: thread.threadId,
        },
        data: {
          repliesDone: thread.repliesSeen,
        },
      });
    } catch {
      log.error('sdn thread: could not mark thread done');
      return finish('failed');
    }
  }
  if (promptsStored > 0 || promptsRejected > 0)
    log.info(`sdn thread: secondary prompts stored=${promptsStored} rejected=${promptsRejected}`);
  return finish('caught-up');
}
