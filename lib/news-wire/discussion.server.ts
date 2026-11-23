/**
 * RMH News discussions: every article can be commented on, liked and reposted, through one ordinary post by the RMH
 * News account (./discussion.ts says why it is a post and how it stays off the timelines).
 *
 * The post is made lazily, the first time a signed-in reader comments on or reposts the article, or when the feed
 * pick features it, so the thousands of headlines nobody discusses cost nothing. It is made once: the article row
 * is claimed with a conditional write (`postId: null`), and a request that loses the race deletes its own post.
 *
 * A discussion post the moderators deleted is not remade; the article's discussion reads as closed.
 */

import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import {
  EMPTY_DISCUSSION,
  NEWS_POST_KIND,
  NEWS_USER_HANDLE,
  NEWS_USER_ID,
  discussionContent,
  discussionHref,
  type NewsDiscussionState,
} from './discussion';

export interface NewsUser {
  id: string;
  handle: string | null;
}

let newsUser: Promise<NewsUser> | null = null;

/**
 * The RMH News account, made on first use. A fixed id, so every process and every deploy finds the same one. It is
 * not a bot-worker account (`isBot` stays false, so the posting bots never write as it) and nobody signs in to it.
 */
export function ensureNewsUser(): Promise<NewsUser> {
  newsUser ??= (async () => {
    const select = { id: true, handle: true } as const;
    const existing = await prisma.user.findUnique({ where: { id: NEWS_USER_ID }, select });
    if (existing) return existing;
    // A person who already holds the handle keeps it; the account is then reached by its id (/u/rmh-news).
    const taken = await prisma.user.findUnique({ where: { handle: NEWS_USER_HANDLE }, select: { id: true } });
    try {
      return await prisma.user.create({
        data: {
          id: NEWS_USER_ID,
          name: 'RMH News',
          handle: taken ? null : NEWS_USER_HANDLE,
          isVerified: true,
          profile: {
            create: { bio: 'Headlines from public news feeds, with a place to talk about them. rmhstudios.com/news' },
          },
        },
        select,
      });
    } catch (err) {
      // Another process made it first.
      const again = await prisma.user.findUnique({ where: { id: NEWS_USER_ID }, select });
      if (again) return again;
      throw err;
    }
  })().catch((err: unknown) => {
    newsUser = null;
    throw err;
  });
  return newsUser;
}

/** The article's discussion as a reader sees it, or null when there is no published article with that slug. */
export async function getDiscussionState(slug: string, viewerId: string | null): Promise<NewsDiscussionState | null> {
  const row = await prisma.newsArticle.findUnique({ where: { slug }, select: { status: true, postId: true } });
  if (!row || row.status !== 'PUBLISHED') return null;
  if (!row.postId) return EMPTY_DISCUSSION;
  return discussionStateForPost(row.postId, viewerId);
}

async function discussionStateForPost(postId: string, viewerId: string | null): Promise<NewsDiscussionState> {
  const [post, repost] = await Promise.all([
    prisma.rMHark.findUnique({
      where: { id: postId },
      select: {
        id: true,
        deletedAt: true,
        commentCount: true,
        repostCount: true,
        likeCount: true,
        user: { select: { handle: true } },
      },
    }),
    viewerId
      ? prisma.rMHarkRepost.findUnique({
          where: { rmheetId_userId: { rmheetId: postId, userId: viewerId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!post || post.deletedAt) return { ...EMPTY_DISCUSSION, closed: true };
  return {
    postId: post.id,
    postHref: discussionHref(post.user.handle, post.id),
    commentCount: post.commentCount,
    repostCount: post.repostCount,
    likeCount: post.likeCount,
    reposted: repost !== null,
    closed: false,
  };
}

/**
 * The article's discussion post, made now if it has none. Null when there is no published article with that slug.
 * A closed discussion (its post deleted) comes back `closed` and is not remade.
 */
export async function ensureDiscussionPost(slug: string, viewerId: string | null): Promise<NewsDiscussionState | null> {
  const row = await prisma.newsArticle.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, status: true, postId: true },
  });
  if (!row || row.status !== 'PUBLISHED') return null;
  if (row.postId) return discussionStateForPost(row.postId, viewerId);

  const user = await ensureNewsUser();
  const post = await prisma.rMHark.create({
    data: {
      userId: user.id,
      content: discussionContent(row.title, `${SITE_URL}/news/${row.slug}`),
      kind: NEWS_POST_KIND,
      audience: 'PUBLIC',
    },
    select: { id: true },
  });
  const claimed = await prisma.newsArticle.updateMany({
    where: { id: row.id, postId: null },
    data: { postId: post.id },
  });
  if (claimed.count === 0) {
    // Another request linked its post first: drop ours and read theirs.
    await prisma.rMHark.delete({ where: { id: post.id } }).catch(() => undefined);
    const winner = await prisma.newsArticle.findUnique({ where: { id: row.id }, select: { postId: true } });
    return winner?.postId ? discussionStateForPost(winner.postId, viewerId) : EMPTY_DISCUSSION;
  }
  return discussionStateForPost(post.id, viewerId);
}
