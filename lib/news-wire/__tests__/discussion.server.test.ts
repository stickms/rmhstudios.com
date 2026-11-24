/**
 * RMH News discussions write public posts as a site account. Pinned here: one discussion post per article, made only
 * on request, never remade after the moderators delete it, and kept off the timelines by its kind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  article: { findUnique: vi.fn(), updateMany: vi.fn() },
  post: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  repost: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    newsArticle: db.article,
    rMHark: db.post,
    rMHarkRepost: db.repost,
    user: db.user,
  },
}));

import { ensureDiscussionPost, getDiscussionState } from '../discussion.server';
import { NEWS_POST_KIND, NEWS_USER_ID } from '../discussion';

const ARTICLE = { id: 'n1', slug: 'story-abc1234', title: 'A story', status: 'PUBLISHED', postId: null };
const POST = { id: 'p1', deletedAt: null, commentCount: 2, repostCount: 1, likeCount: 5, user: { handle: 'rmhnews' } };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: NEWS_USER_ID, handle: 'rmhnews' });
  db.post.create.mockResolvedValue({ id: 'p1' });
  db.post.findUnique.mockResolvedValue(POST);
  db.post.delete.mockResolvedValue({});
  db.article.updateMany.mockResolvedValue({ count: 1 });
  db.repost.findUnique.mockResolvedValue(null);
});

describe('getDiscussionState', () => {
  it('never makes a post, and reads as empty before one exists', async () => {
    db.article.findUnique.mockResolvedValue({ status: 'PUBLISHED', postId: null });
    await expect(getDiscussionState('s', 'u1')).resolves.toMatchObject({ postId: null, commentCount: 0 });
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('reads a deleted discussion post as closed', async () => {
    db.article.findUnique.mockResolvedValue({ status: 'PUBLISHED', postId: 'p1' });
    db.post.findUnique.mockResolvedValue({ ...POST, deletedAt: new Date() });
    await expect(getDiscussionState('s', null)).resolves.toMatchObject({ closed: true, postId: null });
  });
});

describe('ensureDiscussionPost', () => {
  it('makes one public news-kind post by RMH News, linking the article', async () => {
    db.article.findUnique.mockResolvedValue(ARTICLE);
    const state = await ensureDiscussionPost('story-abc1234', 'u1');
    expect(db.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: NEWS_USER_ID, kind: NEWS_POST_KIND, audience: 'PUBLIC' }),
      select: { id: true },
    });
    expect(db.post.create.mock.calls[0]?.[0].data.content).toContain('/news/story-abc1234');
    expect(db.article.updateMany).toHaveBeenCalledWith({ where: { id: 'n1', postId: null }, data: { postId: 'p1' } });
    expect(state).toMatchObject({ postId: 'p1', postHref: '/u/rmhnews/post/p1', commentCount: 2 });
  });

  it('reuses an existing post, and does not remake a deleted one', async () => {
    db.article.findUnique.mockResolvedValue({ ...ARTICLE, postId: 'p1' });
    await ensureDiscussionPost('s', null);
    db.post.findUnique.mockResolvedValue({ ...POST, deletedAt: new Date() });
    await expect(ensureDiscussionPost('s', null)).resolves.toMatchObject({ closed: true });
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('drops its own post when another request linked one first', async () => {
    db.article.findUnique.mockResolvedValueOnce(ARTICLE).mockResolvedValueOnce({ postId: 'p-winner' });
    db.article.updateMany.mockResolvedValue({ count: 0 });
    db.post.findUnique.mockResolvedValue({ ...POST, id: 'p-winner' });
    const state = await ensureDiscussionPost('s', null);
    expect(db.post.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(state?.postId).toBe('p-winner');
  });

  it('is null for an unpublished article', async () => {
    db.article.findUnique.mockResolvedValue({ ...ARTICLE, status: 'STAGING' });
    await expect(ensureDiscussionPost('s', null)).resolves.toBeNull();
    expect(db.post.create).not.toHaveBeenCalled();
  });
});
