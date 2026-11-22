/**
 * Contracts for build comment moderation (s06-14). Client-safe: types only. `$id` is the build's id.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { editCommentBody, hideCommentBody, lockCommentsBody } from '@/lib/builds/comments-schema';

/** The author, within 30 minutes of posting. 409 after that. */
export const editBuildCommentApi = endpoint<{
  body: z.input<typeof editCommentBody>;
  res: {
    comment: {
      id: string;
      content: string;
      edited: boolean;
    };
  };
}>()({
  method: 'PATCH',
  path: '/api/user-builds/$id/comments/$commentId',
});

/** The author, or an admin. Soft: a comment with replies stays as a placeholder. */
export const deleteBuildCommentApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/user-builds/$id/comments/$commentId',
});

/** The build's creator hides a comment from everyone but its author. */
export const hideBuildCommentApi = endpoint<{
  body: z.input<typeof hideCommentBody>;
  res: {
    hidden: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/user-builds/$id/comments/$commentId/hide',
});

/** The build's creator closes or reopens comments. */
export const lockBuildCommentsApi = endpoint<{
  body: z.input<typeof lockCommentsBody>;
  res: {
    locked: boolean;
  };
}>()({
  method: 'PUT',
  path: '/api/user-builds/$id/comments-lock',
});
