/**
 * The nightly clean-up of Dream Rift co-op runs (sprint 15 09): runs the hub started more than 24 hours ago and the
 * host never finished are deleted. Registered by the jobs worker (only it can schedule).
 */
import type { PgBoss } from 'pg-boss';
import { pruneUnfinishedCoopRuns } from './coop-runs.server';

export const COOP_PRUNE_QUEUE = 'dream-rift.coop-prune';
/** Daily at 04:29 UTC. */
export const COOP_PRUNE_CRON = '29 4 * * *';

export async function registerCoopPruneCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(COOP_PRUNE_QUEUE);
  await boss.schedule(COOP_PRUNE_QUEUE, COOP_PRUNE_CRON, {}, { tz: 'UTC' });
  await boss.work(COOP_PRUNE_QUEUE, async () => {
    await pruneUnfinishedCoopRuns();
  });
}
