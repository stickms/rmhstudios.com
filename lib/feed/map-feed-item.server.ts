/**
 * Shared RMHark → FeedItem mapping for read endpoints (tags, explore, etc.).
 * Mirrors the include/mapping used by the main timeline so cards render the same.
 */

import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { groupReactions } from '@/lib/social/reactions';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { mapQuotedOriginal } from '@/lib/feed/quoted-original';
import { countsHiddenFrom, redactCounts } from '@/lib/feed/quiet-counts';
import { pollLifecycleView } from '@/lib/feed/poll-lifecycle';
import { pollOptionCount, rankedPollFields } from '@/lib/feed/ranked-poll';
import { quizRevealFor, viewerHasVoted } from '@/lib/feed/quiz-poll';

/** One per-emoji reaction summary entry, as it appears on a FeedItem. */
type ReactionSummary = NonNullable<FeedItem['reactions']>[number];

/**
 * rmharkInclude WITHOUT the unbounded `reactions` fan-out (perf audit §2.3).
 * Pair with mapRmharksWithBoundedReactions below: instead of pulling every
 * reaction row per post (a viral post can carry tens of thousands), the caller
 * loads per-emoji counts + the viewer's own reactions as two BOUNDED aggregate
 * queries for the whole page. Opt-in — existing callers of rmharkInclude/
 * mapRmharkToFeedItem keep the old behavior, so this is a no-regression change.
 */
export function rmharkIncludeLite(viewerId: string | null) {
  const { reactions: _reactions, ...lite } = rmharkInclude(viewerId);
  return lite;
}

/**
 * Load per-post reaction summaries with two bounded queries (groupBy for the
 * per-emoji counts + the viewer's own reactions), keyed by post id. Mirrors the
 * proven approach in lib/feed/timeline.ts (loadReactionSummaries) so the main
 * timeline and the secondary read paths compute reactions identically.
 */
export async function loadBoundedReactionSummaries(
  postIds: string[],
  viewerId: string | null,
): Promise<Map<string, ReactionSummary[]>> {
  const result = new Map<string, ReactionSummary[]>();
  const ids = [...new Set(postIds)];
  if (ids.length === 0) return result;

  const [grouped, mine] = await Promise.all([
    prisma.rMHarkReaction.groupBy({
      by: ['rmheetId', 'emoji'],
      where: { rmheetId: { in: ids } },
      _count: { _all: true },
    }),
    viewerId
      ? prisma.rMHarkReaction.findMany({
          where: { rmheetId: { in: ids }, userId: viewerId },
          select: { rmheetId: true, emoji: true },
        })
      : Promise.resolve([] as { rmheetId: string; emoji: string }[]),
  ]);

  const mineSet = new Set(mine.map((m) => `${m.rmheetId} ${m.emoji}`));
  for (const g of grouped) {
    const list = result.get(g.rmheetId) ?? [];
    list.push({
      emoji: g.emoji,
      count: g._count._all,
      reactedByMe: mineSet.has(`${g.rmheetId} ${g.emoji}`),
    });
    result.set(g.rmheetId, list);
  }
  for (const list of result.values()) list.sort((a, b) => b.count - a.count);
  return result;
}

/**
 * Which of these posts the viewer has bookmarked, in one bounded query. A
 * bookmark is a `SavedItem` with entityType 'rmhark' (migration 20260803210000
 * folded the old per-post bookmark table in), and that table is polymorphic, so
 * there is no relation to `include` on the post row: the bit is looked up for
 * the whole page and attached after the query, like the reaction summaries.
 */
export async function loadBookmarkedPostIds(
  postIds: string[],
  viewerId: string | null,
): Promise<Set<string>> {
  const ids = [...new Set(postIds)];
  if (!viewerId || ids.length === 0) return new Set();
  const rows = await prisma.savedItem.findMany({
    where: { userId: viewerId, entityType: 'rmhark', entityId: { in: ids } },
    select: { entityId: true },
  });
  return new Set(rows.map((r) => r.entityId));
}

/**
 * Map a page of rmhark rows (fetched with rmharkIncludeLite — no reactions
 * include) to FeedItems, attaching bounded reaction summaries loaded in two
 * aggregate queries for the whole page instead of per-post reaction fan-outs.
 */
export async function mapRmharksWithBoundedReactions(
  rows: { id: string }[],
  viewerId: string | null,
): Promise<FeedItem[]> {
  const ids = rows.map((r) => r.id);
  const [summaries, blocked, bookmarked] = await Promise.all([
    loadBoundedReactionSummaries(ids, viewerId),
    getBlockedAuthorIds(viewerId),
    loadBookmarkedPostIds(ids, viewerId),
  ]);
  return rows.map((r) =>
    mapRmharkToFeedItem(r, viewerId, summaries.get(r.id) ?? [], blocked, bookmarked),
  );
}

/**
 * Whether a post is locked for a viewer: it has a price, the viewer isn't the
 * author, and the viewer hasn't unlocked it. `raw.unlocks` must be included
 * scoped to the viewer (`where: { userId: viewerId }`).
 */
export function isLocked(raw: any, viewerId: string | null): boolean {
  return (
    !!raw.unlockPrice &&
    raw.unlockPrice > 0 &&
    raw.userId !== viewerId &&
    !(raw.unlocks && raw.unlocks.length > 0)
  );
}

/**
 * Strip content/media from a FeedItem when it's locked, leaving only the
 * teaser fields. The single source of truth for paywall blanking — every read
 * path routes through here so locked content can never leak.
 */
export function applyLock(item: FeedItem, raw: any, viewerId: string | null): FeedItem {
  if (!isLocked(raw, viewerId)) return item;
  return {
    ...item,
    content: '',
    imageUrls: undefined,
    imageAlts: undefined,
    gifUrl: undefined,
    gifAlt: undefined,
    poll: undefined,
    locked: true,
    unlockPrice: raw.unlockPrice ?? undefined,
  };
}

export function rmharkInclude(viewerId: string | null) {
  return {
    user: { select: userDisplaySelect },
    reactions: { select: { emoji: true, userId: true } },
    ...(viewerId
      ? {
          likes: { where: { userId: viewerId }, select: { id: true } },
          reposts: { where: { userId: viewerId }, select: { id: true } },
          unlocks: { where: { userId: viewerId }, select: { id: true } },
        }
      : {}),
    poll: {
      include: {
        options: {
          orderBy: { position: 'asc' as const },
          include: {
            _count: { select: { votes: true } },
            ...(viewerId
              ? { votes: { where: { userId: viewerId }, select: { id: true, optionId: true, rank: true } } }
              : {}),
          },
        },
      },
    },
    // The original's community privacy rides along for the quote card's visibility rule.
    original: {
      include: {
        user: { select: userDisplaySelect },
        community: { select: { isPrivate: true } },
      },
    },
  };
}

function mapPoll(
  poll: any,
  countsHidden = false,
  /** s07-19: who is reading and who wrote the post; a quiz's answer is theirs only when earned. */
  reader: { viewerId: string | null; authorId: string } = { viewerId: null, authorId: '' },
): FeedPoll | undefined {
  if (!poll) return undefined;
  const lifecycle = pollLifecycleView(poll);
  const voted = viewerHasVoted(poll.options);
  const totalVotes = poll.options.reduce((s: number, o: any) => s + pollOptionCount(poll, o), 0);
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    ...lifecycle,
    ...rankedPollFields(poll, { ended: lifecycle.ended, countsHidden }),
    ...quizRevealFor(poll, reader, voted),
    totalVotes,
    options: poll.options.map((o: any) => ({
      id: o.id,
      text: o.text,
      voteCount: pollOptionCount(poll, o),
    })),
    myVotes: poll.options.filter((o: any) => o.votes?.length > 0).map((o: any) => o.id),
  };
}

export function mapRmharkToFeedItem(
  r: any,
  viewerId: string | null,
  reactionsOverride?: ReactionSummary[],
  /** The viewer's block set; quote cards of a blocked author's post are withheld. */
  blockedAuthorIds: readonly string[] = [],
  /** Post ids the viewer has bookmarked (`loadBookmarkedPostIds`). */
  bookmarkedIds: ReadonlySet<string> = new Set(),
): FeedItem {
  const item: FeedItem = {
    id: r.id,
    type: 'rmhark',
    createdAt: r.createdAt.toISOString(),
    content: r.content,
    user: resolveUser(r.user),
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    liked: viewerId ? r.likes?.length > 0 : false,
    reposted: viewerId ? r.reposts?.length > 0 : false,
    bookmarked: viewerId ? bookmarkedIds.has(r.id) : false,
    edited: !!r.editedAt,
    original: r.original
      ? mapQuotedOriginal(r.original, resolveUser(r.original.user), viewerId, blockedAuthorIds)
      : undefined,
    poll: mapPoll(r.poll, countsHiddenFrom(r.userId, r.user?.profile?.hideCountsOnMine, viewerId), {
      viewerId,
      authorId: r.userId,
    }),
    gifUrl: r.gifUrl ?? undefined,
    gifAlt: r.gifAlt ?? undefined,
    imageUrls: r.imageUrls ?? undefined,
    imageAlts: r.imageAlts ?? undefined,
    isSensitive: r.isSensitive ?? false,
    contentWarning: r.contentWarning ?? undefined,
    replyControl: r.replyControl ?? 'EVERYONE',
    isTake: r.isTake || undefined,
    hasNote: r.hasNote || undefined,
    hasEmbed: r.hasEmbed || undefined,
    hasVibe: r.hasVibe || undefined,
    seriesId: r.seriesId ?? undefined,
    expiresAt: r.expiresAt?.toISOString(),
    reactions: reactionsOverride ?? groupReactions(r.reactions ?? [], viewerId),
    threadReplyCount: r.threadReplyCount ?? 0,
  };
  // An author who hides their counts shows them to nobody but themselves (lib/feed/quiet-counts).
  return redactCounts(applyLock(item, r, viewerId), viewerId);
}
