import type { PgBoss } from 'pg-boss';
import { runRivalCheck } from '@/lib/arcade/rivals.server';

export const RIVAL_QUEUE = 'arcade.rivals';
/** Daily at 17:35 UTC; the batch already caps itself at one notification per player. */
export const RIVAL_CRON = '35 17 * * *';

export async function registerArcadeCrons(boss: PgBoss): Promise<void> {
  await boss.createQueue(RIVAL_QUEUE);
  await boss.schedule(RIVAL_QUEUE, RIVAL_CRON, {}, { tz: 'UTC' });
  await boss.work(RIVAL_QUEUE, async () => {
    await runRivalCheck();
  });
}
