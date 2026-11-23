/**
 * The RMH News feed pick (./feed-pick.ts has the policy): once an hour the jobs worker checks whether a pick is due
 * and, if so, has the RMH News account repost the chosen story's discussion post. That repost is what puts the story
 * in the Feed (For You, and Following for the account's followers); the discussion post itself stays off the
 * timelines (lib/news-wire/discussion.ts).
 */

import { prisma } from '@/lib/prisma.server';
import { createLogger } from '@/server/shared/logger';
import { ensureDiscussionPost, ensureNewsUser } from './discussion.server';
import { choosePick, feedPickPolicy, pickIsDue, type PickCandidate } from './feed-pick';

export const NEWS_FEED_PICK_QUEUE = 'news.feed-pick';
/** Hourly, off the hour and off the ingest's minutes (7, 27, 47). */
const PICK_CRON = '13 * * * *';

const log = createLogger('news-wire');

export type FeedPickResult =
  | { picked: false; reason: 'off' | 'not-due' | 'no-candidate' | 'closed' }
  | { picked: true; slug: string; postId: string };

export async function runFeedPick(now = new Date()): Promise<FeedPickResult> {
  const policy = feedPickPolicy();
  if (policy.perDay <= 0) return { picked: false, reason: 'off' };

  const recentRows = await prisma.newsArticle.findMany({
    where: { featuredAt: { not: null } },
    orderBy: { featuredAt: 'desc' },
    take: Math.max(policy.perDay, 3),
    select: { featuredAt: true, category: true, sourcePublisher: true },
  });
  const recentDates = recentRows.flatMap((r) => (r.featuredAt ? [r.featuredAt] : []));
  if (!pickIsDue(policy, recentDates, now)) return { picked: false, reason: 'not-due' };

  const rows = await prisma.newsArticle.findMany({
    where: {
      status: 'PUBLISHED',
      featuredAt: null,
      publishedAt: { gte: new Date(now.getTime() - policy.maxAgeHours * 3_600_000) },
    },
    orderBy: { publishedAt: 'desc' },
    take: 300,
    select: {
      id: true,
      slug: true,
      category: true,
      sourcePublisher: true,
      publishedAt: true,
      image: true,
      summary: true,
      postId: true,
    },
  });
  if (rows.length === 0) return { picked: false, reason: 'no-candidate' };

  const postIds = rows.flatMap((r) => (r.postId ? [r.postId] : []));
  const posts = postIds.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: postIds }, deletedAt: null },
        select: { id: true, commentCount: true, repostCount: true, likeCount: true },
      })
    : [];
  const byPost = new Map(posts.map((p) => [p.id, p]));

  const candidates: PickCandidate[] = rows
    // A story whose discussion the moderators removed is not featured.
    .filter((r) => !r.postId || byPost.has(r.postId))
    .map((r) => {
      const post = r.postId ? byPost.get(r.postId) : undefined;
      return {
        id: r.id,
        category: r.category,
        publisher: r.sourcePublisher,
        publishedAt: r.publishedAt,
        hasImage: Boolean(r.image),
        opened: Boolean(r.summary),
        comments: post?.commentCount ?? 0,
        reposts: post?.repostCount ?? 0,
        likes: post?.likeCount ?? 0,
      };
    });
  const recent = recentRows.slice(0, 3).map((r) => ({ category: r.category, publisher: r.sourcePublisher }));
  const choice = choosePick(candidates, recent, policy, now);
  if (!choice) return { picked: false, reason: 'no-candidate' };
  const row = rows.find((r) => r.id === choice.id);
  if (!row) return { picked: false, reason: 'no-candidate' };

  // Claim the pick first, so two workers can never feature two stories in one slot.
  const claimed = await prisma.newsArticle.updateMany({
    where: { id: row.id, featuredAt: null },
    data: { featuredAt: now, featured: true },
  });
  if (claimed.count === 0) return { picked: false, reason: 'not-due' };

  const discussion = await ensureDiscussionPost(row.slug, null);
  if (!discussion?.postId) return { picked: false, reason: 'closed' };
  const user = await ensureNewsUser();
  try {
    await prisma.$transaction([
      prisma.rMHarkRepost.create({ data: { rmheetId: discussion.postId, userId: user.id, createdAt: now } }),
      prisma.rMHark.update({ where: { id: discussion.postId }, data: { repostCount: { increment: 1 } } }),
    ]);
  } catch {
    // Already reposted (an earlier run that died after the repost): the story is in the feed either way.
  }
  return { picked: true, slug: row.slug, postId: discussion.postId };
}

export async function registerNewsFeedPickCron(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(NEWS_FEED_PICK_QUEUE, { policy: 'exclusive' });
  await boss.schedule(NEWS_FEED_PICK_QUEUE, PICK_CRON, {}, { tz: 'UTC' });
  await boss.work(NEWS_FEED_PICK_QUEUE, async () => {
    const result = await runFeedPick();
    if (result.picked) log.info({ event: 'news_wire.feed_pick', slug: result.slug, postId: result.postId });
  });
}
