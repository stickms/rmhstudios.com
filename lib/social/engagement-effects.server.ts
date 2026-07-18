/**
 * Best-effort engagement progression side-effects (rewrite R2-T2).
 *
 * On the hot social write paths (like/comment/follow/bookmark) the core write +
 * counter + realtime event happen in the request; the progression trio
 * (achievement + XP + quests) and the developer-webhook emit are best-effort
 * (they were already `.catch`-swallowed inline). This module packages them so
 * they can run in the background `jobs` worker instead of adding ~4-6 serial
 * queries to every like — while `enqueueProgression` falls back to inline when
 * the queue is unavailable, preserving the prior behaviour exactly.
 */
import { grantAchievement } from '@/lib/achievements/engine.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { emitWebhookEvent } from '@/lib/webhooks/emit.server';
import { getBoss, PROGRESSION_QUEUE } from '@/lib/jobs/boss.server';

export interface ProgressionJob {
  /** The user who took the action (like/comment/follow/bookmark). */
  actorId: string;
  /** Achievement id to grant (idempotent). */
  achievement?: string;
  /** XP to award. */
  xp?: number;
  /** Quest type to progress. Typed from progressQuests so payloads stay valid. */
  questKey?: Parameters<typeof progressQuests>[1];
  /** Developer-API webhook to emit. */
  webhook?: { event: string; data: Record<string, unknown> };
}

/**
 * Run the progression side-effects for one engagement action. Each leg is
 * independently fault-tolerant, matching the prior inline `.catch(() => {})`
 * semantics — one failing leg never blocks the others.
 */
export async function runProgression(job: ProgressionJob): Promise<void> {
  const { actorId, achievement, xp, questKey, webhook } = job;
  if (achievement) await grantAchievement(actorId, achievement).catch(() => {});
  if (xp) await awardXp(actorId, xp).catch(() => {});
  if (questKey) await progressQuests(actorId, questKey).catch(() => {});
  if (webhook) {
    try {
      await emitWebhookEvent(actorId, webhook.event, webhook.data);
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Enqueue progression onto the jobs queue. Falls back to running it inline when
 * pg-boss is unavailable (unset `DATABASE_URL`, startup failure, or a transient
 * send error) so the side effects are never silently dropped — the queue only
 * changes *where* they run, not *whether*.
 */
export async function enqueueProgression(job: ProgressionJob): Promise<void> {
  const boss = await getBoss();
  if (boss) {
    try {
      await boss.send(PROGRESSION_QUEUE, job, {
        retryLimit: 2,
        retryDelay: 10,
        expireInSeconds: 300,
      });
      return;
    } catch (e) {
      console.error('[jobs] enqueue failed; running inline:', (e as Error)?.message);
    }
  }
  await runProgression(job);
}
