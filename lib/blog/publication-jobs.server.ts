/**
 * The pg-boss cron that publishes scheduled Logs (s03-05): every minute, so a Log scheduled for 10:00 is live
 * by 10:01. Registered once from the jobs worker (`server/jobs/index.ts`).
 */
import { publishDueLogs } from '@/lib/blog/publication.server';

export const BLOG_PUBLISH_DUE_QUEUE = 'blog.publish-due';

/** Every minute, UTC. */
const PUBLISH_CRON = '* * * * *';

export async function registerBlogPublicationJobs(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  // exclusive: at most one run queued or active however many workers there are (`publishDueLogs` also takes a
  // database lock and claims each Log, so even a second worker that slipped past this cannot publish twice).
  await boss.createQueue(BLOG_PUBLISH_DUE_QUEUE, {
    policy: 'exclusive',
  });
  await boss.schedule(
    BLOG_PUBLISH_DUE_QUEUE,
    PUBLISH_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(BLOG_PUBLISH_DUE_QUEUE, async () => {
    await publishDueLogs();
  });
}
