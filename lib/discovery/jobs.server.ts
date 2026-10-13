/**
 * P03 discovery background jobs, registered once from server/jobs/index.ts.
 * The post-created job is enqueued by the web tier (never run inline); the
 * crons are idempotent because pg-boss delivers at-least-once.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { fanOutKeywordAlerts } from './alerts.server';
import { watchCommunityPost } from './watch.server';
import { runMemories } from './memories.server';
import { registerTodayCron } from './today.server';

export const POST_CREATED_QUEUE = 'discovery.post-created';
export const DAILY_QUEUE = 'discovery.daily';
const DAILY_CRON = '47 13 * * *';
const HIT_RETENTION_MS = 30 * 86_400_000;

let queueReady = false;

/** Fire-and-forget from the post-create route. Never runs the work inline. */
export async function enqueuePostDiscovery(postId: string): Promise<void> {
  try {
    const boss = await getBoss();
    if (!boss) return;
    if (!queueReady) {
      await boss.createQueue(POST_CREATED_QUEUE);
      queueReady = true;
    }
    await boss.send(
      POST_CREATED_QUEUE,
      { postId },
      { retryLimit: 2, retryDelay: 10, expireInSeconds: 600 },
    );
  } catch (e) {
    console.error('[discovery] enqueue failed:', (e as Error)?.message);
  }
}

async function handlePostCreated(postId: string): Promise<void> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      content: true,
      audience: true,
      deletedAt: true,
      communityId: true,
      community: { select: { isPrivate: true } },
      user: { select: { handle: true } },
    },
  });
  if (!post || post.deletedAt || post.audience !== 'PUBLIC') return;
  const handle = post.user.handle;
  if (post.content.trim() && !post.community?.isPrivate) {
    await fanOutKeywordAlerts({ id: post.id, userId: post.userId, content: post.content, handle });
  }
  if (post.communityId) {
    await watchCommunityPost({
      id: post.id,
      userId: post.userId,
      communityId: post.communityId,
      content: post.content,
      handle,
    });
  }
}

export async function registerDiscoveryJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(POST_CREATED_QUEUE);
  await boss.work<{ postId: string }>(POST_CREATED_QUEUE, async (jobs) => {
    for (const job of jobs) await handlePostCreated(job.data.postId);
  });

  await boss.createQueue(DAILY_QUEUE);
  await boss.schedule(DAILY_QUEUE, DAILY_CRON, {}, { tz: 'UTC' });
  await boss.work(DAILY_QUEUE, async () => {
    await runMemories();
    await prisma.keywordAlertHit.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - HIT_RETENTION_MS) } },
    });
  });

  await registerTodayCron(boss);
}
