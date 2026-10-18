/**
 * pg-boss registration for communities-plus (N5 challenge finalization, N7
 * contributor scores). Server-only; registered once from `server/jobs/index.ts`
 * like `registerEconomyCrons`. Both handlers are idempotent (pg-boss delivers
 * at-least-once): finalization claims each challenge with a conditional update,
 * and the score rebuild is a pure replace.
 */
import type { PgBoss } from 'pg-boss';
import { finalizeDueChallenges } from '@/lib/communities/challenge.server';
import { rebuildAllContributorScores } from '@/lib/communities/contributors.server';

export const CHALLENGE_FINALIZE_QUEUE = 'communities.challenge-finalize';
export const CONTRIBUTORS_QUEUE = 'communities.contributors';

/** Every five minutes: a winner is announced within one tick of the deadline. */
export const CHALLENGE_FINALIZE_CRON = '*/5 * * * *';
/** Daily at 05:10 UTC, in the quiet window. */
export const CONTRIBUTORS_CRON = '10 5 * * *';

export async function registerCommunityCrons(boss: PgBoss): Promise<void> {
  await boss.createQueue(CHALLENGE_FINALIZE_QUEUE);
  await boss.createQueue(CONTRIBUTORS_QUEUE);

  await boss.schedule(CHALLENGE_FINALIZE_QUEUE, CHALLENGE_FINALIZE_CRON, {}, { tz: 'UTC' });
  await boss.schedule(CONTRIBUTORS_QUEUE, CONTRIBUTORS_CRON, {}, { tz: 'UTC' });

  await boss.work(CHALLENGE_FINALIZE_QUEUE, async () => {
    await finalizeDueChallenges();
  });
  await boss.work(CONTRIBUTORS_QUEUE, async () => {
    await rebuildAllContributorScores();
  });
}
