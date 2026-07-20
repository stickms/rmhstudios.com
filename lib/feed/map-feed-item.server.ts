/**
 * Shared RMHark → FeedItem mapping for read endpoints (tags, explore, etc.).
 * Mirrors the include/mapping used by the main timeline so cards render the same.
 */

import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { groupReactions } from '@/lib/social/reactions';

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
 * Map a page of rmhark rows (fetched with rmharkIncludeLite — no reactions
 * include) to FeedItems, attaching bounded reaction summaries loaded in two
 * aggregate queries for the whole page instead of per-post reaction fan-outs.
 */
export async function mapRmharksWithBoundedReactions(
  rows: { id: string }[],
  viewerId: string | null,
): Promise<FeedItem[]> {
  const summaries = await loadBoundedReactionSummaries(
    rows.map((r) => r.id),
    viewerId,
  );
  return rows.map((r) => mapRmharkToFeedItem(r, viewerId, summaries.get(r.id) ?? []));
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
          bookmarks: { where: { userId: viewerId }, select: { id: true } },
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
              ? { votes: { where: { userId: viewerId }, select: { id: true, optionId: true } } }
              : {}),
          },
        },
      },
    },
    original: { include: { user: { select: userDisplaySelect } } },
  };
}

function mapPoll(poll: any): FeedPoll | undefined {
  if (!poll) return undefined;
  const totalVotes = poll.options.reduce((s: number, o: any) => s + (o._count?.votes ?? 0), 0);
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    totalVotes,
    options: poll.options.map((o: any) => ({
      id: o.id,
      text: o.text,
      voteCount: o._count?.votes ?? 0,
    })),
    myVotes: poll.options.filter((o: any) => o.votes?.length > 0).map((o: any) => o.id),
  };
}

export function mapRmharkToFeedItem(
  r: any,
  viewerId: string | null,
  reactionsOverride?: ReactionSummary[],
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
    bookmarked: viewerId ? r.bookmarks?.length > 0 : false,
    edited: !!r.editedAt,
    original: r.original
      ? {
          id: r.original.id,
          type: 'rmhark',
          createdAt: r.original.createdAt.toISOString(),
          content: r.original.content,
          user: resolveUser(r.original.user),
          likeCount: r.original.likeCount,
          commentCount: r.original.commentCount,
          repostCount: r.original.repostCount,
          viewCount: r.original.viewCount,
        }
      : undefined,
    poll: mapPoll(r.poll),
    gifUrl: r.gifUrl ?? undefined,
    imageUrls: r.imageUrls ?? undefined,
    imageAlts: r.imageAlts ?? undefined,
    isSensitive: r.isSensitive ?? false,
    replyControl: r.replyControl ?? 'EVERYONE',
    reactions: reactionsOverride ?? groupReactions(r.reactions ?? [], viewerId),
    threadReplyCount: r.threadReplyCount ?? 0,
  };
  return applyLock(item, r, viewerId);
}
