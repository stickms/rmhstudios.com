import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-limits';
import { extractFirstUrl } from '../RMHarkContent';
import type { Comment } from '../CommentItem';

/**
 * Pure state helpers for the single-post page: nested reply edits, the comment
 * counter, the link-preview rule, the reply budget and the full-date format.
 * No React state, no I/O.
 */

/** Characters left in a reply draft (negative when over the limit). */
export function remainingReplyChars(draft: string): number {
  return MAX_COMMENT_LENGTH - draft.length;
}

/** The reply button is live for a non-blank draft within the limit that isn't already sending. */
export function canSubmitReply(draft: string, submitting: boolean): boolean {
  return !(!draft.trim() || remainingReplyChars(draft) < 0 || submitting);
}

/**
 * The URL to unfurl under the post: only the first link of a text-only post
 * (no poll, GIF or image, and not empty).
 */
export function postLinkPreviewUrl(post: FeedItem | null): string | null {
  if (
    !post ||
    post.poll ||
    post.gifUrl ||
    (post.imageUrls && post.imageUrls.length > 0) ||
    !post.content
  )
    return null;
  return extractFirstUrl(post.content);
}

/** Every user a post body mentions (author, reposter, quoted author). */
export function postBodyUsers(post: FeedItem): FeedItemUser[] {
  const users: FeedItemUser[] = [];
  if (post.user) users.push(post.user);
  if (post.repostedBy) users.push(post.repostedBy);
  if (post.original?.user) users.push(post.original.user);
  return users;
}

/** Move a post's reply count by `delta`, never below zero. */
export function withCommentDelta(post: FeedItem | null, delta: number): FeedItem | null {
  return post ? { ...post, commentCount: Math.max(0, (post.commentCount ?? 0) + delta) } : post;
}

/** Append `reply` under the comment `parentId`, at any depth. */
export function addReplyDeep(comments: Comment[], parentId: string, reply: Comment): Comment[] {
  return comments.map((c) => {
    if (c.id === parentId) {
      return { ...c, replies: [...(c.replies ?? []), reply] };
    }
    if (c.replies?.length) {
      return { ...c, replies: addReplyDeep(c.replies, parentId, reply) };
    }
    return c;
  });
}

/** Drop a comment (and its subtree) at any depth. */
export function removeCommentDeep(comments: Comment[], commentId: string): Comment[] {
  return comments
    .filter((c) => c.id !== commentId)
    .map((c) =>
      c.replies?.length ? { ...c, replies: removeCommentDeep(c.replies, commentId) } : c,
    );
}

/** X2: flip a reply's hidden flag in place (it regroups under "Hidden replies"). */
export function setCommentHiddenDeep(
  list: Comment[],
  commentId: string,
  hidden: boolean,
): Comment[] {
  return list.map((c) => ({
    ...c,
    ...(c.id === commentId ? { hidden } : {}),
    ...(c.replies?.length ? { replies: setCommentHiddenDeep(c.replies, commentId, hidden) } : {}),
  }));
}

/** The signed-in user as replies see them: the resolved (custom) name and image win. */
export function withResolvedIdentity<U extends { image?: string | null; name?: string | null }>(
  user: U,
  resolved: { image?: string | null; name?: string | null } | null | undefined,
): U {
  return {
    ...user,
    image: resolved?.image || user.image,
    name: resolved?.name || user.name,
  };
}

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** One reply on a top-level reply's nested spine, with who it answers when that is not the reply above it in the thread. */
export interface FlatReply {
  comment: Comment;
  /** The handle (or name) of the reply this one answers, set below the first level only. */
  replyingTo: string | null;
}

/**
 * The replies under a top-level reply, flattened for ONE nested spine (Steel P2: a nested spine is allowed for replies to a
 * reply and no deeper). Depth-first, so a thread still reads in order; a reply to a reply to a reply says whom it answers
 * instead of being indented a third time. A reply the post's author hid (X2) takes its whole subtree with it into the
 * hidden group.
 */
export function flattenReplies(root: Comment): { visible: FlatReply[]; hidden: FlatReply[] } {
  const visible: FlatReply[] = [];
  const hidden: FlatReply[] = [];
  const walk = (node: Comment, isRoot: boolean, inHidden: boolean) => {
    for (const reply of node.replies ?? []) {
      const goesHidden = inHidden || !!reply.hidden;
      (goesHidden ? hidden : visible).push({
        comment: reply,
        replyingTo: isRoot ? null : node.user?.handle || node.user?.name || null,
      });
      walk(reply, false, goesHidden);
    }
  };
  walk(root, true, false);
  return { visible, hidden };
}
