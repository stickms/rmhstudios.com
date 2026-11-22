/**
 * Shared shaping + pagination helpers for the v1 API, so every endpoint returns
 * consistent objects and uses the same keyset-pagination envelope.
 */

import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { countsHiddenFrom } from '@/lib/feed/quiet-counts';
import { isPollEnded, pollEffectiveEnd } from '@/lib/feed/poll-lifecycle';
import { viewRankedResult, type RankedResult } from '@/lib/feed/ranked-poll';
import type { QuizFields } from '@/lib/feed/quiz-poll';

/** The Prisma select for an author block on any post/comment/list item. */
export const apiAuthorSelect = userDisplaySelect;

export interface ApiAuthor {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

type ResolvableUser = Parameters<typeof resolveUser>[0];

/** Compact public author block. */
export function serializeAuthor(user: ResolvableUser): ApiAuthor {
  const u = resolveUser(user);
  return { id: u.id, name: u.name, handle: u.handle, image: u.image };
}

export interface PageParams {
  limit: number;
  cursor: string | null;
}

/** Parse `?limit=&cursor=` with clamping. Cursor is an opaque string. */
export function parsePage(url: URL, opts: { defaultLimit?: number; maxLimit?: number } = {}): PageParams {
  const def = opts.defaultLimit ?? 20;
  const max = opts.maxLimit ?? 50;
  const raw = parseInt(url.searchParams.get('limit') || String(def), 10);
  const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : def, max);
  const cursor = url.searchParams.get('cursor');
  return { limit, cursor: cursor && cursor.length ? cursor : null };
}

/** Build the `{ data, nextCursor }` envelope for a keyset page. */
export function page<T>(items: T[], limit: number, cursorOf: (last: T) => string): { data: T[]; nextCursor: string | null } {
  const nextCursor = items.length === limit ? cursorOf(items[items.length - 1]) : null;
  return { data: items, nextCursor };
}

/**
 * Metrics block shared by post serializers. `hidden` is the author's "hide counts on my posts" switch as it
 * applies to this caller (`countsHiddenFrom`): every figure is then `null`, never the real number.
 */
export function metrics(
  p: { likeCount: number; commentCount: number; repostCount: number; viewCount: number },
  hidden = false,
) {
  if (hidden) return { likes: null, comments: null, reposts: null, views: null };
  return { likes: p.likeCount, comments: p.commentCount, reposts: p.repostCount, views: p.viewCount };
}

interface PostRow {
  id: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  imageUrls?: string[];
  imageAlts?: string[];
  /** The GIF on the post and its description (sprint 06 #15); both read as null when there is none. */
  gifUrl?: string | null;
  gifAlt?: string | null;
  /** The content warning (sprint 06 #16): the flag and its optional reason. The text is still returned; clients decide how to show it. */
  isSensitive?: boolean | null;
  contentWarning?: string | null;
  /** The reply the author pinned, when the query selected it. */
  pinnedCommentId?: string | null;
  /** The post's place among its author's pinned posts, when the route looked it up (`pinnedOrderFor`); absent otherwise. */
  pinnedOrder?: number | null;
}

/** A post owned by the caller (includes audience). */
export function serializeOwnPost(p: PostRow & { audience: string }) {
  return {
    id: p.id,
    content: p.content,
    audience: p.audience,
    imageUrls: p.imageUrls ?? [],
    imageAlts: p.imageAlts ?? [],
    gifUrl: p.gifUrl ?? null,
    gifAlt: p.gifAlt ?? null,
    sensitive: p.isSensitive ?? false,
    contentWarning: p.contentWarning ?? null,
    pinnedReplyId: p.pinnedCommentId ?? null,
    ...(p.pinnedOrder !== undefined ? { pinnedOrder: p.pinnedOrder } : {}),
    createdAt: p.createdAt,
    metrics: metrics(p),
  };
}

/** A public post with its author block, its metrics withheld when the author hides them from `viewerId`. */
export function serializePublicPost(p: PostRow & { user: ResolvableUser }, viewerId: string | null) {
  return {
    id: p.id,
    content: p.content,
    imageUrls: p.imageUrls ?? [],
    imageAlts: p.imageAlts ?? [],
    gifUrl: p.gifUrl ?? null,
    gifAlt: p.gifAlt ?? null,
    sensitive: p.isSensitive ?? false,
    contentWarning: p.contentWarning ?? null,
    pinnedReplyId: p.pinnedCommentId ?? null,
    ...(p.pinnedOrder !== undefined ? { pinnedOrder: p.pinnedOrder } : {}),
    createdAt: p.createdAt,
    author: serializeAuthor(p.user),
    metrics: metrics(p, countsHiddenFrom(p.user.id, p.user.profile?.hideCountsOnMine, viewerId)),
  };
}

interface ApiPollRow {
  id: string;
  question: string;
  multiSelect: boolean;
  ranked: boolean;
  closesAt: Date | null;
  closedAt: Date | null;
  options: { id: string; text: string }[];
}

/**
 * The poll on a post, for `GET /api/v1/posts/{id}` (sprint 06 #19). `ranked` says the poll is ranked-choice; `result`
 * is the instant-runoff count, present only once a ranked poll has ended. Round tallies are whole percents when the
 * author hides counts from this viewer (quiet counts), counts otherwise.
 *
 * `quiz` is what `quizRevealFor` allowed this key's owner to know (s07-19): the marker always, the answer and the
 * explanation only for the author, a voter, or anyone once the poll has ended.
 */
export function serializePostPoll(
  poll: ApiPollRow,
  result: RankedResult | null,
  countsHidden: boolean,
  quiz: QuizFields = {},
) {
  const view = result ? viewRankedResult(result, countsHidden) : null;
  const end = pollEffectiveEnd(poll);
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    ranked: poll.ranked,
    quiz: quiz.quiz === true,
    correctOptionId: quiz.correctOptionId ?? null,
    explanation: quiz.explanation ?? null,
    ended: isPollEnded(poll),
    closesAt: end ? end.toISOString() : null,
    options: poll.options.map((o) => ({ id: o.id, text: o.text })),
    result: view
      ? {
          winnerOptionId: view.winnerOptionId,
          percentOnly: view.percentOnly,
          rounds: view.rounds.map((r) => ({ tally: r.tally, eliminatedOptionId: r.eliminatedOptionId })),
        }
      : null,
  };
}
