/**
 * `@handle` mentions in a game's discussions (s15-12).
 *
 * `notifyThreadMentions` runs after a thread or a reply has committed and tells each member the text names, once:
 * `MENTION` rows with the key notice `game-thread-mention` ("{{name}} mentioned you in {{title}}"); the type's own
 * category (Replies & mentions) governs them. The first {@link MAX_MENTION_NOTICES} unique handles count; the writer is never told; members
 * blocked either way with the writer, members who muted the writer, banned members and members waiting to be deleted
 * are skipped (`reachableRecipients`, the rule the reply notice applies). The thread's own mute is applied by
 * `createNotification` through the `game-thread:<id>` key: a full mute drops the notice and a `mentions` mute lets it
 * through, because a mention is addressed to its recipient. `dedupeUnread` with `dedupeAnyActor` keys the row on the
 * thread alone, so a member holds one unread mention per thread however many posts, by however many writers, name
 * them: a later mention refreshes that row (its writer, sentence and link) instead of adding one. Failures are logged and never fail the
 * post. The post's text is not in the notice; the title and name are params (member text).
 *
 * `resolveThreadMentions` is the page's side: one handle lookup for every body on a thread page, so the page can link
 * the handles that belong to a member and leave the rest as text.
 */
import { prisma } from '@/lib/prisma.server';
import { deliverNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { findUsersByHandles } from '@/lib/handles/lookup.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { noticeName, reachableRecipients, threadScopeKey } from '@/lib/games/thread-notices.server';
import { MAX_MENTION_NOTICES, mentionedHandles, mentionedHandlesIn } from '@/lib/games/thread-text';
import type { ThreadMentions } from '@/lib/games/hub-types';

/** The longest title carried in a notice (the stored preview is cut at 280 characters). */
const TITLE_CHARS = 80;

export interface ThreadMentionPost {
  /** The reply's id; null for a discussion's opening post, which has no anchor of its own. */
  postId: string | null;
  threadId: string;
  gameId: string;
  threadTitle: string;
  body: string;
  writerId: string;
}

/** Where a mention notice opens: the reply, or the top of the discussion for its opening post. */
export function mentionLink(post: Pick<ThreadMentionPost, 'postId' | 'threadId' | 'gameId'>): string {
  const base = `/games/hub/${post.gameId}/t/${post.threadId}`;
  return post.postId ? `${base}#post-${post.postId}` : base;
}

/**
 * Tell the members `post.body` mentions. Returns the ids that now hold the mention (a new row or a refreshed unread
 * one), which `createPost` hands to `notifyThreadReply` so a member who is both mentioned and a reply recipient gets
 * the mention only; a member whose mention was dropped (mentions turned off) still gets the reply notice. Never
 * throws.
 */
export async function notifyThreadMentions(post: ThreadMentionPost): Promise<string[]> {
  const told: string[] = [];
  try {
    const handles = mentionedHandles(post.body, MAX_MENTION_NOTICES);
    if (handles.length === 0) return told;
    const matches = await findUsersByHandles(handles, { excludeUserId: post.writerId });
    if (matches.length === 0) return told;
    const recipients = await reachableRecipients(
      post.writerId,
      matches.map((m) => m.id),
    );
    if (recipients.length === 0) return told;
    const writer = await prisma.user.findUnique({ where: { id: post.writerId }, select: userDisplaySelect });
    if (!writer) return told;
    const name = noticeName(writer);
    const title = post.threadTitle.slice(0, TITLE_CHARS);
    const link = mentionLink(post);
    // One after another: at most five, and a burst of parallel writes would only crowd the connection pool.
    for (const userId of recipients) {
      const delivered = await deliverNotification({
        type: 'MENTION',
        userId,
        actorId: post.writerId,
        entityType: 'game-thread',
        entityId: post.threadId,
        preview: notice('game-thread-mention', { name, title }),
        link,
        dedupeUnread: true,
        dedupeAnyActor: true,
        conversationKey: threadScopeKey(post.threadId),
      });
      if (delivered) told.push(userId);
    }
    return told;
  } catch (err) {
    console.error('[thread-mentions] notifyThreadMentions failed:', err);
    return told;
  }
}

/**
 * The members the handles in `bodies` belong to, for a page's links: lower-cased handle to the handle as stored (the
 * profile route matches it exactly) and the member's name. One handle lookup however many bodies there are, bounded by
 * `MAX_PAGE_HANDLES`; members waiting to be deleted are left out. A failure answers nothing, so the page still renders.
 */
export async function resolveThreadMentions(bodies: readonly string[]): Promise<ThreadMentions> {
  try {
    const handles = mentionedHandlesIn(bodies);
    if (handles.length === 0) return {};
    const matches = await findUsersByHandles(handles);
    if (matches.length === 0) return {};
    const members = await prisma.user.findMany({
      where: { id: { in: matches.map((m) => m.id) }, deletionScheduledAt: null },
      select: userDisplaySelect,
    });
    const out: ThreadMentions = {};
    for (const m of members) {
      if (!m.handle) continue;
      out[m.handle.toLowerCase()] = { handle: m.handle, name: resolveUserDisplay(m).name?.trim() || m.handle };
    }
    return out;
  } catch (err) {
    console.error('[thread-mentions] resolveThreadMentions failed:', err);
    return {};
  }
}
