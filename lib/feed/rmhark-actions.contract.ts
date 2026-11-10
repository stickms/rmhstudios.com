/**
 * Contracts for the per-post actions under /api/rmharks/$id/** (redesign audit
 * C1, batch 2). Client-safe: types only, by `import type`.
 *
 * Not covered here on purpose: image uploads (multipart), the comment POSTs
 * (`useReconsider` reads the raw 409 `Response`), the AI routes, and the
 * post PATCH/GET that carry the whole `FeedItem` shape.
 */
import type { CodeEmbed } from '@/lib/code-embed/shared';
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedItem } from '@/lib/feed-types';
import type { QuotesPage } from '@/lib/feed/quotes';
import type { TakeState, TakeVote } from '@/lib/feed/take';
import type { PostVersion } from '@/lib/feed/word-diff';
import type { ReactionSummary } from '@/lib/social/reactions';

export const likePostApi = endpoint<{ res: { success: true; liked: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/like',
});

export const repostPostApi = endpoint<{ res: { success: true; reposted: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/repost',
});

export const bookmarkPostApi = endpoint<{ res: { success: true; bookmarked: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/bookmark',
});

export const pinPostApi = endpoint<{ res: { success: true; pinned: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/pin',
});

export const deletePostApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/rmharks/$id',
});

/** Toggle an emoji reaction. The route validates the emoji by hand (400 `Invalid emoji`). */
export const reactToPostApi = endpoint<{
  body: { emoji: string };
  res: { success: true; reacted: boolean; reactions: ReactionSummary[] };
}>()({ method: 'POST', path: '/api/rmharks/$id/react' });

/** Always `{ success: true }` — even when rate limited or on error (views never fail visibly). */
export const viewPostApi = endpoint<{ res: { success: true } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/view',
});

export const getTakeApi = endpoint<{ res: TakeState }>()({
  method: 'GET',
  path: '/api/rmharks/$id/take',
});

export const voteTakeApi = endpoint<{ body: { vote: TakeVote }; res: TakeState }>()({
  method: 'POST',
  path: '/api/rmharks/$id/take',
});

export const postQuotesApi = endpoint<{ query: { cursor?: string }; res: QuotesPage }>()({
  method: 'GET',
  path: '/api/rmharks/$id/quotes',
});

export const postHistoryApi = endpoint<{ res: { postId: string; versions: PostVersion[] } }>()({
  method: 'GET',
  path: '/api/rmharks/$id/history',
});

/** Author-only. */
export const postInsightsApi = endpoint<{
  res: {
    createdAt: string;
    views: number;
    likes: number;
    comments: number;
    reposts: number;
    bookmarks: number;
    engagementRate: number;
    isPaid: boolean;
    unlockPrice: number | null;
    unlocks: number;
    coinsEarned: number;
    likeTrend: { date: string; count: number }[];
  };
}>()({ method: 'GET', path: '/api/rmharks/$id/insights' });

/** 503 when summaries are switched off; `summary` is null for a thread that is too short. */
export const postSummaryApi = endpoint<{
  res: { summary: string | null; cached?: true; reason?: string };
}>()({ method: 'GET', path: '/api/rmharks/$id/summary' });

export const similarPostsApi = endpoint<{ res: { items: FeedItem[] } }>()({
  method: 'GET',
  path: '/api/rmharks/$id/similar',
});

export const postEmbedApi = endpoint<{ res: CodeEmbed }>()({
  method: 'GET',
  path: '/api/rmharks/$id/embed',
});

/** 400 `Not enough coins`. Idempotent: a free or already-unlocked post answers `alreadyUnlocked`. */
export const unlockPostApi = endpoint<{
  res: { success: true; content: string; alreadyUnlocked?: true };
}>()({ method: 'POST', path: '/api/rmharks/$id/unlock' });

/* ── Comments ─────────────────────────────────────────────────────────────── */

export const deleteCommentApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/rmharks/$id/comment/$commentId',
});

export const likeCommentApi = endpoint<{ res: { success: true; liked: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/comment/$commentId/like',
});

export const repostCommentApi = endpoint<{ res: { success: true; reposted: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/comment/$commentId/repost',
});

export const viewCommentApi = endpoint<{ res: { success: true } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/comment/$commentId/view',
});

export const hideCommentApi = endpoint<{ body: { hidden: boolean }; res: { hidden: boolean } }>()({
  method: 'POST',
  path: '/api/rmharks/$id/comment/$commentId/hide',
});
