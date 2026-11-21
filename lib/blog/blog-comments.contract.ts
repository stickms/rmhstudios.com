/**
 * Contracts for the announcement discussion. Client-safe: types only, by `import type`.
 * Only a blog post with `announcement: true` has a discussion; any other slug answers 404.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedItemUser } from '@/lib/feed-types';
import type { createBlogCommentSchema } from '@/lib/blog/blog-comments-schema';

/** Longest comment, in characters. Here rather than in the zod schema file so the composer ships no zod. */
export const BLOG_COMMENT_MAX_LENGTH = 2000;

export interface BlogCommentView {
  id: string;
  content: string;
  /** ISO timestamp. */
  createdAt: string;
  user: FeedItemUser;
  /** The viewer wrote it or is an admin. */
  canDelete: boolean;
}

export interface BlogCommentList {
  comments: BlogCommentView[];
  /** Comments in the discussion (not only the ones returned). */
  total: number;
}

/** Oldest first. */
export const listBlogCommentsApi = endpoint<{
  res: BlogCommentList;
}>()({
  method: 'GET',
  path: '/api/blog/$slug/comments',
});

/** 201. */
export const createBlogCommentApi = endpoint<{
  body: z.infer<typeof createBlogCommentSchema>;
  res: {
    comment: BlogCommentView;
  };
}>()({
  method: 'POST',
  path: '/api/blog/$slug/comments',
});

/** Soft delete; the author or an admin. */
export const deleteBlogCommentApi = endpoint<{
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/blog/comments/$id',
});
