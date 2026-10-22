/**
 * The one rule for a quote card: may THIS viewer see the quoted original, and
 * what does the card carry when they may not.
 *
 * A quote-post is visible on its own audience; the post it quotes has a
 * different one ("quoting something does not republish it"). Every quote card
 * (the timeline, the profile tabs, the shared mapper behind bookmarks / threads /
 * tags / explore) used to return the original's text for any original and hide
 * only its media for non-public ones, so a quote of a FOLLOWERS, PRIVATE,
 * CIRCLE, private-community or blocked-author post showed that post's text to
 * everyone who saw the quote. The OG card already answered this with
 * `postCardShowsContent`; this is that same rule, plus the two things a
 * signed-in viewer adds: your own post is always yours to see, and an author on
 * your block list (either direction) is not.
 *
 * Deliberately conservative: a FOLLOWERS / CIRCLE / SUPPORTERS original is shown
 * as unavailable even to a viewer who could open it directly. Deciding that per
 * card needs a graph lookup per quote on the hottest read path; opening the
 * quoted post itself still applies the exact rule (`canViewPost`).
 *
 * Client-safe on purpose (no server imports), like `lib/og/post-visibility`.
 */

import type { FeedItem } from '@/lib/feed-types';
import { postCardShowsContent, type PostCardSubject } from '@/lib/og/post-visibility';

/** What the rule reads from the quoted post (a Prisma row satisfies it). */
export interface QuotedOriginalSubject extends PostCardSubject {
  userId: string;
  communityId?: string | null;
}

/** Shown in place of a quoted post the viewer may not see. */
export const QUOTE_UNAVAILABLE_MESSAGE = '[This RMHark is not available]';

/**
 * Whether `viewerId` may see the quoted original's content.
 * `blockedAuthorIds` is the viewer's block set in both directions
 * (`getBlockedAuthorIds`), not the wider mute-inclusive hidden set.
 */
export function quotedOriginalVisibleTo(
  original: QuotedOriginalSubject,
  viewerId: string | null,
  blockedAuthorIds: readonly string[],
): boolean {
  if (original.deletedAt) return false;
  if (viewerId && original.userId === viewerId) return true;
  if (blockedAuthorIds.includes(original.userId)) return false;
  // A community the select did not load is treated as private: fail closed.
  if (original.communityId && !original.community) return false;
  return postCardShowsContent(original);
}

/** The columns a quote card draws from the original (a Prisma row satisfies it). */
export interface QuotedOriginalRow extends QuotedOriginalSubject {
  id: string;
  createdAt: Date;
  content: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  gifUrl?: string | null;
  imageUrls?: string[];
  imageAlts?: string[];
  deletedByAdmin?: boolean;
}

/** The FeedItem fields the three states of a quote card share. */
function cardBase(o: QuotedOriginalRow, user: FeedItem['user']) {
  return {
    id: o.id,
    type: 'rmhark' as const,
    createdAt: o.createdAt.toISOString(),
    user,
  };
}

/** `createdAt` of a card that must not date its post (clients never render it on a quote card). */
const NEUTRAL_CREATED_AT = new Date(0).toISOString();

/**
 * The base of a card that must not say who wrote the post or when: no author
 * (clients render a missing quote author as "Unknown"), and a neutral date.
 */
function anonymousCardBase(o: QuotedOriginalRow) {
  return { id: o.id, type: 'rmhark' as const, createdAt: NEUTRAL_CREATED_AT, user: undefined };
}

/** Whether a (possibly deleted) post's author is public knowledge: public, free of a private community. */
function authorIsPublic(o: QuotedOriginalSubject): boolean {
  if (o.audience !== 'PUBLIC') return false;
  if (o.communityId && !o.community) return false;
  return !o.community?.isPrivate;
}

/**
 * The quote card for an original: the full card when the viewer may see it, a
 * "deleted" card when it is gone, and an "unavailable" card (no text, no media,
 * no counts) otherwise.
 */
export function mapQuotedOriginal(
  o: QuotedOriginalRow | null | undefined,
  user: FeedItem['user'],
  viewerId: string | null,
  blockedAuthorIds: readonly string[],
): FeedItem | undefined {
  if (!o) return undefined;
  if (o.deletedAt) {
    return {
      // A deleted members-only post's author is still members-only knowledge.
      ...(authorIsPublic(o) ? cardBase(o, user) : anonymousCardBase(o)),
      content: o.deletedByAdmin
        ? '[This RMHark was deleted by an admin]'
        : '[This RMHark was deleted by the user]',
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      viewCount: 0,
      deletedAt: new Date(o.deletedAt).toISOString(),
      deletedByAdmin: o.deletedByAdmin,
    };
  }
  if (!quotedOriginalVisibleTo(o, viewerId, blockedAuthorIds)) {
    return {
      // No author, no date: naming who wrote a members-only post is the leak.
      ...anonymousCardBase(o),
      content: QUOTE_UNAVAILABLE_MESSAGE,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      viewCount: 0,
    };
  }
  // Visible: free originals show their media (the viewer's own priced post is
  // theirs; a priced post by someone else never reaches here).
  const showMedia = (o.unlockPrice ?? 0) === 0 && o.audience === 'PUBLIC';
  return {
    ...cardBase(o, user),
    content: o.content,
    likeCount: o.likeCount,
    commentCount: o.commentCount,
    repostCount: o.repostCount,
    viewCount: o.viewCount,
    gifUrl: showMedia ? (o.gifUrl ?? undefined) : undefined,
    imageUrls: showMedia ? o.imageUrls : undefined,
    imageAlts: showMedia ? o.imageAlts : undefined,
  };
}

/**
 * A cached quote card that has stopped being visible: the same card with its
 * text, media and counts withheld (deleted gets the deleted message). Used where
 * a card was assembled earlier and is re-checked at serve time.
 */
export function withholdQuotedOriginal(card: FeedItem, deleted: boolean): FeedItem {
  return {
    ...card,
    // Same as the unavailable card: a post withheld from this viewer names no author.
    user: undefined,
    createdAt: NEUTRAL_CREATED_AT,
    content: deleted ? '[This RMHark was deleted by the user]' : QUOTE_UNAVAILABLE_MESSAGE,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    gifUrl: undefined,
    imageUrls: undefined,
    imageAlts: undefined,
    deletedAt: deleted ? (card.deletedAt ?? new Date().toISOString()) : card.deletedAt,
  };
}
