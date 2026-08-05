/**
 * Narrative Wrapped (A9) — the written paragraph, produced ahead of time.
 * Server-only.
 *
 * Wrapped renders a stat grid. A stat grid is not a story, and the share rate
 * of a grid is a fraction of the share rate of a sentence about you. This
 * module turns the already-computed bundle from `wrapped.server.ts` into one
 * paragraph using the registered `WRAPPED_NARRATIVE` prompt.
 *
 * **Everything interesting here is about WHEN, not what.** The generation is a
 * single constrained call; the design work is that it happens on a schedule
 * instead of on page load:
 *
 *  - Wrapped traffic is spiky by construction. Nobody opens Wrapped in March;
 *    everybody opens it within an hour of the announcement. Generating on
 *    request means the first thing that happens at peak is a burst of model
 *    calls, which is how you meet the provider's rate limit at the worst
 *    possible moment — and the failure lands on the users who showed up
 *    fastest.
 *  - Precomputing also makes the cost knowable in advance. `generateWrapped-
 *    Narrative` is one call per eligible member per year, enqueued at a rate
 *    the worker controls, rather than an unbounded function of how well the
 *    announcement performs.
 *
 * **Where the result lives.** There is no `WrappedNarrative` table — adding one
 * is a schema change this work does not need. The paragraph is written to Redis
 * (shared by the jobs worker and the web tier) with a long TTL, mirrored into
 * the in-process `apiCache` so a hot page does not hit Redis per request. When
 * `REDIS_URL` is unset the Redis helpers no-op, so a single-process dev setup
 * still works through `apiCache` alone, and a multi-process deployment without
 * Redis simply keeps serving the templated blurb. Both degradations are
 * silent-and-correct: the page always renders.
 *
 * The wiring this module cannot do itself — it cannot edit `server/` — is one
 * call from the jobs worker; see `registerWrappedNarrativeCron` below.
 */

import type { PgBoss } from 'pg-boss';
import { apiCache } from '@/lib/cache';
import { prisma } from '@/lib/prisma.server';
import { redisGetJSON, redisSetJSON } from '@/lib/redis.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { asData, systemFor, WRAPPED_NARRATIVE } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import {
  collectWrappedStats,
  hasNarratableYear,
  type WrappedStats,
} from '@/lib/wrapped/wrapped.server';

/* -------------------------------------------------------------------------- */
/* Queue identity                                                             */
/* -------------------------------------------------------------------------- */

/**
 * pg-boss queue for one member's narrative. Exported because the jobs worker
 * (`server/jobs/index.ts`) is the consumer and this module is the producer, and
 * a queue name typed twice is a queue name that eventually disagrees with
 * itself.
 */
export const WRAPPED_NARRATIVE_QUEUE = 'wrapped.narrative';

/**
 * The fan-out queue the cron fires. Separate from the per-user queue on purpose:
 * pg-boss retries a failed job, and a fan-out that retried would re-enqueue
 * everyone it had already enqueued. Splitting them means a per-user failure
 * retries one user, and a fan-out failure retries a bounded, idempotent scan.
 */
export const WRAPPED_NARRATIVE_FANOUT_QUEUE = 'wrapped.narrative.fanout';

/** Daily at 03:10 UTC — off the hour so it does not stack with the other crons. */
export const WRAPPED_NARRATIVE_CRON = '10 3 * * *';

export interface WrappedNarrativeJob {
  userId: string;
  year: number;
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 45 days. Wrapped is opened in a window measured in weeks, and a narrative is
 * a pure function of a finished year, so nothing about it goes stale — the TTL
 * exists to reclaim keys, not to force regeneration.
 */
const NARRATIVE_TTL_MS = 45 * 24 * 60 * 60 * 1000;

/** In-process mirror TTL. Short: it only has to absorb a burst, not a season. */
const LOCAL_TTL_MS = 10 * 60_000;

const cacheKey = (userId: string, year: number) => `wrapped:narrative:${year}:${userId}`;

/**
 * Read a precomputed narrative. **Never generates** — that is the whole point
 * of the module, and a "generate on miss" convenience here would quietly
 * reintroduce the page-load model call this design exists to remove.
 */
export async function readWrappedNarrative(userId: string, year: number): Promise<string | null> {
  const key = cacheKey(userId, year);

  const local = apiCache.get<string>(key);
  if (local) return local;

  try {
    const shared = await redisGetJSON<string>(key);
    if (typeof shared === 'string' && shared) {
      apiCache.set(key, shared, LOCAL_TTL_MS);
      return shared;
    }
  } catch (err) {
    // A cache read failing is not a page failing. Fall through to the templated
    // blurb rather than turning a Redis blip into a 500 on /wrapped.
    console.warn('[wrapped] narrative read failed:', (err as Error)?.message);
  }
  return null;
}

async function storeNarrative(userId: string, year: number, text: string): Promise<void> {
  const key = cacheKey(userId, year);
  apiCache.set(key, text, LOCAL_TTL_MS);
  try {
    await redisSetJSON(key, text, NARRATIVE_TTL_MS);
  } catch (err) {
    // The job still succeeded — the web tier just will not see it. Logged
    // rather than thrown so pg-boss does not retry a completed generation and
    // pay for the same paragraph twice.
    console.error('[wrapped] narrative store failed:', (err as Error)?.message);
  }
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Render the year as labelled numbers.
 *
 * Two deliberate omissions:
 *
 *  - **No post text.** The top post is the most tempting thing to include and
 *    the worst: it is arbitrary user-authored text, so it is the one field in
 *    the bundle an attacker controls, and `WRAPPED_NARRATIVE` explicitly wants
 *    the paragraph built from numbers. Its like count carries the interesting
 *    part anyway. (`asData()` still wraps the whole payload — defense in depth,
 *    not a licence to feed it prose.)
 *  - **No handle or display name.** The prompt writes in second person, so a
 *    name adds nothing, and every identifier not sent is one not sent.
 */
function statsToText(year: number, stats: WrappedStats): string {
  return [
    `year: ${year}`,
    `posts written: ${stats.posts}`,
    `likes received: ${stats.likesReceived}`,
    `comments received: ${stats.commentsReceived}`,
    `new followers: ${stats.newFollowers}`,
    `achievements unlocked: ${stats.achievementsUnlocked}`,
    `coins earned: ${stats.coinsEarned}`,
    `level reached: ${stats.level}`,
    `longest daily streak: ${stats.longestStreak} day(s)`,
    `busiest month: ${stats.busiestMonth ?? 'none — activity was spread evenly'}`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export type NarrativeSkipReason =
  /** No `DEEPSEEK_API_KEY`. */
  | 'ai-unavailable'
  /** The year is too quiet to narrate; the templated blurb reads better. */
  | 'nothing-to-say'
  /** The member's monthly AI allowance is spent. */
  | 'budget-exceeded'
  /** The provider failed, or returned something the contract rejects. */
  | 'generation-failed';

export interface NarrativeResult {
  narrative: string | null;
  reason?: NarrativeSkipReason;
  /** True when a cached narrative already existed and no call was made. */
  cached: boolean;
}

/**
 * Produce and store one member's paragraph.
 *
 * Idempotent by cache: an existing narrative short-circuits, so re-running the
 * job (a retry, a manual backfill, a second cron tick inside the TTL) costs a
 * cache read rather than a generation.
 *
 * **Never throws.** It runs inside a queue consumer, and the failures it can
 * hit are all permanent for this input — an exhausted budget, a quiet year, a
 * provider that refuses. Throwing would make pg-boss retry them on a schedule,
 * which spends money to fail identically. Every one comes back as a `reason`
 * the caller can log and move on from.
 */
export async function generateWrappedNarrative(
  userId: string,
  year: number = new Date().getUTCFullYear() - 1,
): Promise<NarrativeResult> {
  const existing = await readWrappedNarrative(userId, year);
  if (existing) return { narrative: existing, cached: true };

  if (!isAiConfigured()) return { narrative: null, reason: 'ai-unavailable', cached: false };

  const stats = await collectWrappedStats(userId, year);
  if (!hasNarratableYear(stats)) {
    return { narrative: null, reason: 'nothing-to-say', cached: false };
  }

  // Attributed to the member, and gated by their allowance. Wrapped is a gift
  // rather than something they asked for, so the gate is applied and then
  // *absorbed*: a member who spent their month on compose-assist gets the
  // templated blurb, not an error and not an unbilled call.
  try {
    await assertAiBudget(userId);
  } catch (err) {
    if (err instanceof AppError && err.code === 'AI_BUDGET_EXCEEDED') {
      return { narrative: null, reason: 'budget-exceeded', cached: false };
    }
    throw err;
  }

  try {
    const raw = await runTask(
      'narrative',
      systemFor(WRAPPED_NARRATIVE),
      asData(statsToText(year, stats)),
      {
        userId,
        promptId: WRAPPED_NARRATIVE.id,
        promptVer: WRAPPED_NARRATIVE.version,
      },
    );

    const narrative = raw.trim().slice(0, WRAPPED_NARRATIVE.maxChars);
    if (!narrative) return { narrative: null, reason: 'generation-failed', cached: false };

    await storeNarrative(userId, year, narrative);
    return { narrative, cached: false };
  } catch (err) {
    console.warn('[wrapped] narrative generation failed:', (err as Error)?.message);
    return { narrative: null, reason: 'generation-failed', cached: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Fan-out                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The window in which narratives are worth having: December 1 through
 * January 15 (UTC). Outside it the cron fires, checks the date, and does
 * nothing — which is why a daily schedule is affordable. Wrapped is announced
 * in this window, so precomputing in November would generate paragraphs for a
 * year that has not finished.
 */
export function inWrappedWindow(now = new Date()): boolean {
  const month = now.getUTCMonth();
  return month === 11 || (month === 0 && now.getUTCDate() <= 15);
}

/** The year a run at `now` should narrate: December's own year, January's previous. */
export function targetWrappedYear(now = new Date()): number {
  return now.getUTCMonth() === 11 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/**
 * How many members one fan-out tick enqueues.
 *
 * A ceiling rather than "everyone" because the daily cron gives us 45 ticks to
 * work through the eligible set, and a bounded batch is what keeps a burst of
 * queue inserts (and the model calls behind them) predictable. Members already
 * narrated short-circuit inside the job, so later ticks cost a cache read each
 * and naturally advance onto members the earlier ticks did not reach.
 */
const FANOUT_BATCH = 2_000;

export interface FanoutResult {
  year: number;
  /** Zero outside the Wrapped window. */
  enqueued: number;
  skipped: 'outside-window' | 'ai-unavailable' | null;
}

/**
 * Enqueue narrative jobs for members who were active in the target year.
 *
 * "Active" is deliberately cheap to evaluate — a post in the year — because the
 * expensive eligibility test (`hasNarratableYear`, which needs the full
 * aggregation) runs inside the per-user job where it belongs. Enqueuing someone
 * who turns out to be too quiet costs a job that returns `nothing-to-say`; the
 * alternative is running the whole aggregation for the entire member table
 * inside one fan-out.
 */
export async function fanOutWrappedNarratives(
  boss: PgBoss,
  now = new Date(),
): Promise<FanoutResult> {
  const year = targetWrappedYear(now);
  if (!inWrappedWindow(now)) return { year, enqueued: 0, skipped: 'outside-window' };
  if (!isAiConfigured()) return { year, enqueued: 0, skipped: 'ai-unavailable' };

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const authors = await prisma.rMHark.findMany({
    where: { deletedAt: null, createdAt: { gte: start, lt: end } },
    select: { userId: true },
    distinct: ['userId'],
    take: FANOUT_BATCH,
  });

  let enqueued = 0;
  for (const { userId } of authors) {
    // Singleton key: pg-boss drops a duplicate while one is still queued, so a
    // second tick inside the same day cannot double-enqueue a member.
    await boss.send(
      WRAPPED_NARRATIVE_QUEUE,
      { userId, year } satisfies WrappedNarrativeJob,
      { singletonKey: `${year}:${userId}`, retryLimit: 2, retryDelay: 60 },
    );
    enqueued++;
  }

  return { year, enqueued, skipped: null };
}

/**
 * Register the Wrapped narrative cron + both workers on a running pg-boss.
 *
 * Call this ONCE from the jobs worker after `const boss = await getBoss(true)`,
 * next to `registerDigestCron(boss)`:
 *
 * ```ts
 * import { registerWrappedNarrativeCron } from '@/lib/wrapped/narrative.server';
 * // ... inside main(), after getBoss(true):
 * await registerWrappedNarrativeCron(boss);
 * ```
 *
 * Only the instance created with `getBoss(true)` has `schedule: true`, so this
 * must run there and not in the send-only web producer. Safe to call more than
 * once — `createQueue`/`schedule` are idempotent.
 */
export async function registerWrappedNarrativeCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(WRAPPED_NARRATIVE_QUEUE);
  await boss.createQueue(WRAPPED_NARRATIVE_FANOUT_QUEUE);

  await boss.schedule(WRAPPED_NARRATIVE_FANOUT_QUEUE, WRAPPED_NARRATIVE_CRON, {}, { tz: 'UTC' });

  await boss.work(WRAPPED_NARRATIVE_FANOUT_QUEUE, async () => {
    const result = await fanOutWrappedNarratives(boss);
    console.warn(`[wrapped] fan-out: ${JSON.stringify(result)}`);
  });

  await boss.work<WrappedNarrativeJob>(WRAPPED_NARRATIVE_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { userId, year } = job.data;
      // `generateWrappedNarrative` never throws, so a `reason` here is a
      // decision rather than an incident — logged at warn only when it points
      // at something operationally interesting.
      const result = await generateWrappedNarrative(userId, year);
      if (result.reason === 'generation-failed') {
        console.warn(`[wrapped] narrative failed for ${userId} (${year})`);
      }
    }
  });
}
