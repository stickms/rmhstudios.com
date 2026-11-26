/**
 * Announcement discussion — server logic. Server-only.
 * Contract: ./blog-comments.contract.ts
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { publishedLogWhere } from '@/lib/blog/publication';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getActiveBan } from '@/lib/admin-audit.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { notBannedWhere } from '@/lib/moderation/workshop-moderation';
import type { BlogCommentView } from '@/lib/blog/blog-comments.contract';

export const commentInclude = {
  user: {
    select: userDisplaySelect,
  },
} as const;

export interface CommentViewer {
  id: string;
  isAdmin: boolean;
}

/** The live announcement post behind a slug, or null: an ordinary post, and a draft, have no discussion. */
export async function findAnnouncementPost(slug: string): Promise<{
  id: string;
} | null> {
  return prisma.blogPost.findFirst({
    where: {
      slug,
      announcement: true,
      ...publishedLogWhere(new Date()),
    },
    select: {
      id: true,
    },
  });
}

/**
 * The comments of one announcement a viewer may see (shared by the list and its count, so `total` is what the viewer
 * can see). Left out: deleted comments; authors the viewer blocked, was blocked by or muted
 * (`hiddenAuthorIds`, `getHiddenAuthorIds`, empty when signed out); and, for everyone, authors who are banned now.
 * `userId` is a required column, so the filter is `notIn`, never a null comparison.
 */
export function visibleCommentsWhere(
  postId: string,
  hiddenAuthorIds: readonly string[],
  now: Date = new Date(),
): Prisma.BlogCommentWhereInput {
  return {
    postId,
    deletedAt: null,
    ...(hiddenAuthorIds.length ? { userId: { notIn: [...hiddenAuthorIds] } } : {}),
    user: notBannedWhere(now),
  };
}

/** Pure: who may delete a comment. */
export function canDeleteComment(viewer: CommentViewer | null, commentUserId: string): boolean {
  return !!viewer && (viewer.isAdmin || viewer.id === commentUserId);
}

export function toCommentView(
  row: {
    id: string;
    content: string;
    createdAt: Date;
    userId: string;
    user: Parameters<typeof resolveUser>[0];
  },
  viewer: CommentViewer | null,
): BlogCommentView {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    user: resolveUser(row.user),
    canDelete: canDeleteComment(viewer, row.userId),
  };
}

/**
 * The gates an RMHark reply passes before it is written: a suspended account, then a timeout on replying.
 * Null when the user may comment, else the refusal to return.
 */
export async function commentBlockedResponse(userId: string): Promise<Response | null> {
  const ban = await getActiveBan(userId);
  if (ban) {
    return Response.json(
      {
        error: `Your account is suspended${ban.reason ? `: ${ban.reason}` : ''}`,
      },
      {
        status: 403,
      },
    );
  }
  return restrictionResponse(userId, 'comment');
}
