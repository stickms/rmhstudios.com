/**
 * Following a news story (s13-12), server only: the fan-out that tells each follower once when an admin links a
 * published article to the story, its queue and worker, the account export and the erasure operation.
 *
 * The notice rides a durable `FanoutRun` of kind `news-story-article` (subject `<storyId>:<articleSlug>`), queued
 * after `linkArticle` commits, so a worker restart neither skips nor repeats a batch, and linking the same article
 * again starts nothing (a finished run is not restarted). Followers who are banned, pending deletion or erased are
 * skipped. The follow, unfollow and cap rules live in `stories.server.ts`.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { runFanout, type FanoutBatch } from '@/lib/fanout/run.server';
import {
  STORY_FANOUT_BATCH,
  STORY_FANOUT_MAX,
  STORY_FANOUT_QUEUE,
  STORY_NOTICE_ENTITY,
  eligibleFollowers,
  storyFanoutJobKey,
  storyFanoutSubject,
  storyNoticeLink,
  type StoryFanoutJob,
} from '@/lib/reading/story-follows';

export { STORY_FANOUT_QUEUE };

/**
 * The next batch of a story's followers strictly after `after` (a user id), already filtered: not banned, not
 * pending deletion. A follower is a member who follows the story or holds an in-app reading subscription to it (the
 * story page shows both as "Following"), counted once.
 */
export async function followerBatch(
  storyId: string,
  storySlug: string,
  after: string | null,
  take: number,
  now: Date = new Date(),
): Promise<FanoutBatch> {
  const rows = await prisma.user.findMany({
    where: {
      ...(after ? { id: { gt: after } } : {}),
      OR: [
        { newsStoryFollows: { some: { storyId } } },
        { readingSubscriptions: { some: { kind: 'news_story', target: storySlug, inApp: true } } },
      ],
    },
    orderBy: { id: 'asc' },
    take,
    select: { id: true, bannedUntil: true, deletionScheduledAt: true },
  });
  if (rows.length === 0) return { recipients: [], collapse: [], lastId: null, scanned: 0, done: true };
  return {
    recipients: eligibleFollowers(rows, now),
    collapse: [],
    lastId: rows[rows.length - 1]!.id,
    scanned: rows.length,
    done: rows.length < take,
  };
}

/** Members who already have the reading fan-out's notice for this article, so a subscriber is not told twice. */
async function toldByReading(articleId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.notification.findMany({
    where: { userId: { in: ids }, entityType: 'news_article', entityId: articleId },
    select: { userId: true, entityType: true, entityId: true },
  });
  return new Set(
    (Array.isArray(rows) ? rows : [])
      .filter((r) => r.entityType === 'news_article' && r.entityId === articleId)
      .map((r) => r.userId),
  );
}

export interface StoryFanoutResult {
  /** Notices written (members skipped as already told by an earlier runner count). */
  notified: number;
}

/**
 * The job: tell a story's followers about an article linked to it. Re-reads the link and the article and does nothing
 * when the article is no longer in the story or is not published (an unlink notifies nobody).
 */
export async function runStoryArticleFanout(
  storyId: string,
  articleSlug: string,
  now: Date = new Date(),
): Promise<StoryFanoutResult> {
  const link = await prisma.newsStoryArticle.findUnique({
    where: { articleSlug },
    select: { storyId: true, story: { select: { title: true, slug: true } } },
  });
  if (!link || link.storyId !== storyId) return { notified: 0 };
  const article = await prisma.newsArticle.findUnique({
    where: { slug: articleSlug },
    select: { id: true, title: true, status: true },
  });
  if (!article || article.status !== 'PUBLISHED') return { notified: 0 };

  const preview = notice('news-story-article', { story: link.story.title, title: article.title });
  const href = storyNoticeLink(articleSlug);

  const totals = await runFanout(
    {
      kind: 'news-story-article',
      subjectId: storyFanoutSubject(storyId, articleSlug),
      delivery: { type: 'SYSTEM', entityType: STORY_NOTICE_ENTITY, entityId: storyId, link: href },
      async step(after, scanned) {
        const take = Math.min(STORY_FANOUT_BATCH, STORY_FANOUT_MAX - scanned);
        if (take <= 0) return { recipients: [], collapse: [], lastId: null, scanned: 0, done: true };
        const read = await followerBatch(storyId, link.story.slug, after, take, now);
        const told = await toldByReading(article.id, read.recipients);
        const batch = told.size ? { ...read, recipients: read.recipients.filter((id) => !told.has(id)) } : read;
        return scanned + batch.scanned >= STORY_FANOUT_MAX ? { ...batch, done: true } : batch;
      },
      async send(recipients) {
        // createNotification applies each member's preferences, quiet hours and push, one recipient at a time.
        for (const userId of recipients) {
          await createNotification({
            userId,
            type: 'SYSTEM',
            entityType: STORY_NOTICE_ENTITY,
            entityId: storyId,
            preview,
            link: href,
          });
        }
      },
    },
    now,
  );
  return { notified: totals?.sent ?? 0 };
}

/**
 * Queue the fan-out for an article that has just been linked. Called after `linkArticle` commits. Keyed by
 * (story, article), so queueing twice is one job; a queue that is down is logged, never thrown (the link exists).
 */
export async function enqueueStoryArticleFanout(storyId: string, articleSlug: string): Promise<void> {
  try {
    const boss = await getBoss();
    if (!boss) throw new Error('queue unavailable');
    const job: StoryFanoutJob = { storyId, articleSlug };
    await boss.send(STORY_FANOUT_QUEUE, job, {
      singletonKey: storyFanoutJobKey(storyId, articleSlug),
      retryLimit: 3,
      retryDelay: 60,
    });
  } catch (error) {
    console.error('[news] could not queue the story fan-out:', error);
  }
}

export async function registerStoryArticleFanoutWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(STORY_FANOUT_QUEUE);
  await boss.work<StoryFanoutJob>(STORY_FANOUT_QUEUE, async (jobs) => {
    // A throw makes pg-boss retry per the send options; the run row's lease and told-ids rule make the retry safe.
    for (const job of jobs) await runStoryArticleFanout(job.data.storyId, job.data.articleSlug);
  });
}

/** The member's own data for the account export: the stories they follow, titles as they are now. */
export async function exportStoryFollows(
  userId: string,
): Promise<{ storySlug: string; title: string; followedAt: string }[]> {
  const rows = await prisma.newsStoryFollow.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, story: { select: { slug: true, title: true } } },
  });
  return rows.map((r) => ({ storySlug: r.story.slug, title: r.story.title, followedAt: r.createdAt.toISOString() }));
}

/** Erasure: the member's follows (a deleted account is anonymised in place, so the cascade never fires). */
export function storyFollowErasureOps(userId: string) {
  return [prisma.newsStoryFollow.deleteMany({ where: { userId } })];
}
