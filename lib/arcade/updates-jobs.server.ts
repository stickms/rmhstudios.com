/**
 * The `games.update-fanout` work queue: one job per published patch note or guide, run by the jobs worker
 * (`server/jobs/index.ts`). A work queue, not a cron: it is fed by the request that published the item and does
 * its work off that request.
 */
import type { PgBoss } from 'pg-boss';
import { getBoss } from '@/lib/jobs/boss.server';
import { fanOutGameUpdate } from '@/lib/arcade/updates.server';
import type { FanoutJob } from '@/lib/arcade/updates';

export const GAME_UPDATE_FANOUT_QUEUE =
  'games.update-fanout';

const jobKey =
  (
    job: FanoutJob,
  ) =>
    job.kind ===
    'update'
      ? `update:${job.noteId}`
      : `guide:${job.guideId}`;

/**
 * Queue the fan-out for a published patch note or guide. A queue that is down is logged, never thrown: the item is
 * already published and the publisher must not see a failure for it.
 */
export async function enqueueGameUpdateFanout(
  job: FanoutJob,
): Promise<void> {
  try {
    const boss =
      await getBoss();
    if (
      !boss
    )
      throw new Error(
        'queue unavailable',
      );
    await boss.send(
      GAME_UPDATE_FANOUT_QUEUE,
      job,
      {
        singletonKey:
          jobKey(
            job,
          ),
        retryLimit: 3,
        retryDelay: 60,
      },
    );
  } catch (error) {
    console.error(
      '[games] could not queue the update fan-out:',
      error,
    );
  }
}

export async function registerGameUpdateFanoutWorker(
  boss: PgBoss,
): Promise<void> {
  await boss.createQueue(
    GAME_UPDATE_FANOUT_QUEUE,
  );
  await boss.work<FanoutJob>(
    GAME_UPDATE_FANOUT_QUEUE,
    async (
      jobs,
    ) => {
      // A throw makes pg-boss retry per the send options; the fan-out's dedupe makes the retry safe.
      for (const job of jobs)
        await fanOutGameUpdate(
          job.data,
        );
    },
  );
}
