/**
 * The fan-out reclaim cron (s08-05), server only. The fan-outs themselves ride their own work queues
 * (`communities.post-alerts`, `events.update-fanout`); this cron finds runs whose lease expired (their worker was
 * restarted) and sends the same job again. Which runner may continue is decided by the lease on the run row, never by
 * the job, so a duplicate job is harmless.
 */
import type { PgBoss } from 'pg-boss';
import { reclaimStalledFanouts, type ReclaimedRun } from '@/lib/fanout/run.server';
import { POST_ALERT_QUEUE } from '@/lib/communities/post-alerts.server';
import { UPDATE_FANOUT_QUEUE, updateJobKey } from '@/lib/events/updates';
import { postAlertJobKey } from '@/lib/communities/post-alerts';
import { PARTY_FANOUT_QUEUE, partyFanoutJobKey } from '@/lib/rmhtube/subscriptions';
import { STORY_FANOUT_QUEUE, parseStoryFanoutSubject, storyFanoutJobKey } from '@/lib/reading/story-follows';

export const FANOUT_RECLAIM_QUEUE = 'fanouts.reclaim';
/** Every minute. */
export const FANOUT_RECLAIM_CRON = '* * * * *';

/** The queue, payload and job options that run a reclaimed fan-out again. */
export function reclaimJob(run: ReclaimedRun): {
  queue: string;
  data: Record<string, string>;
  options: {
    singletonKey: string;
    retryLimit: number;
    retryDelay: number;
  };
} {
  // s13-07: a party notice rides its own queue, keyed by the room.
  if (run.kind === 'tube-party')
    return {
      queue: PARTY_FANOUT_QUEUE,
      data: {
        roomId: run.subjectId,
      },
      options: {
        singletonKey: partyFanoutJobKey(run.subjectId),
        retryLimit: 3,
        retryDelay: 60,
      },
    };
  // s13-12: an article notice rides its own queue, keyed by the (story, article) pair its subject names.
  if (run.kind === 'news-story-article') {
    const pair = parseStoryFanoutSubject(run.subjectId) ?? { storyId: run.subjectId, articleSlug: '' };
    return {
      queue: STORY_FANOUT_QUEUE,
      data: {
        storyId: pair.storyId,
        articleSlug: pair.articleSlug,
      },
      options: {
        singletonKey: storyFanoutJobKey(pair.storyId, pair.articleSlug),
        retryLimit: 3,
        retryDelay: 60,
      },
    };
  }
  return run.kind === 'post-alert'
    ? {
        queue: POST_ALERT_QUEUE,
        data: {
          postId: run.subjectId,
        },
        options: {
          singletonKey: postAlertJobKey(run.subjectId),
          retryLimit: 3,
          retryDelay: 60,
        },
      }
    : {
        queue: UPDATE_FANOUT_QUEUE,
        data: {
          updateId: run.subjectId,
        },
        options: {
          singletonKey: updateJobKey(run.subjectId),
          retryLimit: 3,
          retryDelay: 60,
        },
      };
}

/** Every minute: queue the fan-outs whose lease expired, and stop the ones that keep dying. */
export async function registerFanoutReclaimCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(FANOUT_RECLAIM_QUEUE);
  await boss.schedule(
    FANOUT_RECLAIM_QUEUE,
    FANOUT_RECLAIM_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(FANOUT_RECLAIM_QUEUE, async () => {
    for (const run of await reclaimStalledFanouts()) {
      const job = reclaimJob(run);
      await boss.send(job.queue, job.data, job.options);
    }
  });
}
