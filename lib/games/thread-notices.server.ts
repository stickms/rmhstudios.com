/**
 * Replies in a game's discussion threads, told to the people in them (s14-11).
 *
 * When a post is added, the thread's author and the authors of its earlier posts (distinct, at most
 * {@link MAX_THREAD_RECIPIENTS} in all) are told `game-thread-reply`: "{{name}} replied in {{title}}". It replaces the
 * old `notifyHubReply`, which told only the thread's author, in English, with no block, mute or ban check. The row keeps
 * `type: 'REPLY'`, `entityType: 'hub-thread'` and `entityId: threadId`, so `dedupeUnread` refreshes an unread row the old
 * code wrote and a burst from one poster stays one row.
 *
 * Skipped: the poster, members blocked either way with the poster, members who muted the poster, banned members and
 * members whose account is waiting to be deleted. A member who muted the thread is skipped by `createNotification`
 * itself, through the `game-thread:<id>` conversation key. Written after the post has committed; a failure is logged
 * and never fails the post. The post's text is not in the notice, and the title and name are params (member text).
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { activeMuteWhere } from '@/lib/moderation/mute-expiry';
import { scopeKeyFor } from '@/lib/notify/conversation-prefs.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';

/** Most people one post can tell: written in the request, so the bound is what keeps it cheap. */
export const MAX_THREAD_RECIPIENTS = 50;
/** The longest title carried in a notice (the stored preview is cut at 280 characters). */
const TITLE_CHARS = 80;

/** The conversation key a thread's mute is stored under (`game-thread:<id>`). */
export const threadScopeKey = (threadId: string) => scopeKeyFor('game-thread', threadId);

/** A name for a notice: the display name, else the handle. Member text, so never translated. */
export function noticeName(user: Parameters<typeof resolveUserDisplay>[0] & { handle?: string | null }): string {
  return resolveUserDisplay(user).name?.trim() || user.handle || 'Someone';
}

/**
 * Of `candidateIds`, the members `actorId` may reach: not blocked either way with the actor, not muting them, not
 * banned and not waiting to be deleted. Three reads however many candidates there are. Also used by the song-comment
 * notice, so both apply one rule.
 */
export async function reachableRecipients(actorId: string, candidateIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(candidateIds)].filter((id) => id !== actorId);
  if (ids.length === 0) return [];
  const now = new Date();
  const [blocks, mutes, unavailable] = await Promise.all([
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: actorId, blockedId: { in: ids } },
          { blockedId: actorId, blockerId: { in: ids } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.userMute.findMany({
      where: { mutedId: actorId, muterId: { in: ids }, ...activeMuteWhere(now) },
      select: { muterId: true },
    }),
    prisma.user.findMany({
      where: { id: { in: ids }, OR: [{ bannedUntil: { gt: now } }, { deletionScheduledAt: { not: null } }] },
      select: { id: true },
    }),
  ]);
  const out = new Set<string>();
  for (const b of blocks) out.add(b.blockerId === actorId ? b.blockedId : b.blockerId);
  for (const m of mutes) out.add(m.muterId);
  for (const u of unavailable) out.add(u.id);
  return ids.filter((id) => !out.has(id));
}

/**
 * Who a new post in `threadId` by `posterId` is told to: the thread's author first, then the authors of the thread's
 * earlier posts, newest first, at most {@link MAX_THREAD_RECIPIENTS} in all and never the poster. Blocks, mutes, bans
 * and pending deletions are applied. The thread's own mute is applied by `createNotification`, per recipient.
 */
export async function threadReplyRecipients(
  threadId: string,
  posterId: string,
  threadAuthorId?: string,
): Promise<string[]> {
  const [author, earlier] = await Promise.all([
    threadAuthorId !== undefined
      ? Promise.resolve(threadAuthorId)
      : prisma.gameThread.findUnique({ where: { id: threadId }, select: { authorId: true } }).then((t) => t?.authorId),
    // `groupBy` rather than `distinct`: the newest post per author is what orders them, not an arbitrary row.
    prisma.gameThreadPost.groupBy({
      by: ['authorId'],
      where: { threadId },
      orderBy: { _max: { createdAt: 'desc' } },
      // One more than the cap, so the poster's own earlier post cannot cost a place.
      take: MAX_THREAD_RECIPIENTS + 1,
    }),
  ]);
  const candidates = [...new Set([...(author ? [author] : []), ...earlier.map((p) => p.authorId)])]
    .filter((id) => id !== posterId)
    .slice(0, MAX_THREAD_RECIPIENTS);
  return reachableRecipients(posterId, candidates);
}

export interface ThreadReplyPost {
  id: string;
  threadId: string;
  gameId: string;
  threadTitle: string;
  threadAuthorId: string;
  posterId: string;
}

/** Tell everyone `threadReplyRecipients` names. Never throws: the post is already committed. */
export async function notifyThreadReply(post: ThreadReplyPost): Promise<number> {
  try {
    const [recipients, poster] = await Promise.all([
      threadReplyRecipients(post.threadId, post.posterId, post.threadAuthorId),
      prisma.user.findUnique({ where: { id: post.posterId }, select: userDisplaySelect }),
    ]);
    if (recipients.length === 0 || !poster) return 0;
    const name = noticeName(poster);
    const title = post.threadTitle.slice(0, TITLE_CHARS);
    const link = `/games/hub/${post.gameId}/t/${post.threadId}#post-${post.id}`;
    // One after another: at most 50, and a burst of parallel writes would only crowd the connection pool.
    for (const userId of recipients) {
      await createNotification({
        type: 'REPLY',
        category: 'replies',
        userId,
        actorId: post.posterId,
        entityType: 'hub-thread',
        entityId: post.threadId,
        preview: notice('game-thread-reply', { name, title }),
        link,
        dedupeUnread: true,
        conversationKey: threadScopeKey(post.threadId),
      });
    }
    return recipients.length;
  } catch (err) {
    console.error('[thread-notices] notifyThreadReply failed:', err);
    return 0;
  }
}
