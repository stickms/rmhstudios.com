/**
 * F24 — the ONE place a mention becomes a notification.
 *
 * Three rules decide whether an `@handle` is delivered, and every surface that
 * gets one of them wrong becomes a harassment vector:
 *
 *  1. **The cap.** At most {@link MAX_MENTIONS} resolved mentions per message.
 *     A message with two hundred handles is a broadcast spam tool that costs one
 *     paste to send.
 *  2. **Blocks beat mentions.** A block is checked in BOTH directions. Someone
 *     you blocked must not be able to reach your notification tray by typing
 *     your handle — that is precisely the reach the block removed — and someone
 *     who blocked *you* should not receive your mention either.
 *  3. **Visibility.** You cannot mention a person into a room they cannot see.
 *     Without this, a private group's member list leaks ("@alice was added to
 *     something") and a stranger receives a notification linking to a 404 —
 *     which is itself a way to repeatedly ping someone with no way to mute it.
 *
 * Centralising is the entire point. Today each of the five mention surfaces
 * (feed posts, feed comments, group chat, lobby chat, guide comments, library
 * annotations) would have to implement all three independently, and the one
 * that forgets is the one that gets used for abuse. Callers describe *what* they
 * are and pass the audience; this module decides *who* hears about it.
 *
 * Best-effort by contract: a mention fan-out must never fail the write that
 * produced it. Everything here is wrapped, and the result object reports what
 * happened rather than throwing.
 */

import { prisma } from '@/lib/prisma.server';
import { dispatch } from '@/lib/notify/dispatch.server';
import { mentionedHandles, MAX_MENTIONS } from '@/lib/mentions/parse';

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Where the mention was written. Used for the notification link/entity and as a
 * label in the drop counters — not for any policy decision, which is deliberate:
 * policy comes from the {@link MentionAudience}, so a new surface cannot get
 * weaker rules by picking a new name.
 */
export type MentionSurface =
  | 'rmhark'
  | 'comment'
  | 'group-chat'
  | 'lobby-chat'
  | 'guide-comment'
  | 'library-annotation';

/**
 * Who is allowed to be mentioned here.
 *
 * `public` means the content is world-readable (a feed post), so any resolvable
 * handle is a legitimate target. `members` carries the exact id set that can see
 * the room; anyone outside it is dropped silently — silently because telling the
 * sender "that person isn't in this group" would turn the mention box into a
 * membership oracle for private rooms.
 */
export type MentionAudience =
  | { kind: 'public' }
  | { kind: 'members'; memberIds: readonly string[] };

export interface MentionContext {
  /** Who wrote the text. Never notified about their own mention. */
  authorId: string;
  surface: MentionSurface;
  /** `entityType`/`entityId` on the notification row (what the mention is IN). */
  entityType: string;
  entityId: string;
  /** Where clicking the notification goes. */
  link: string;
  /** Short snapshot of the text, truncated to the column width by this module. */
  preview: string;
  /** Audience gate — see {@link MentionAudience}. */
  audience: MentionAudience;
  /**
   * Conversation this belongs to (`group:<id>` | `dm:<id>` | `space:<id>`), so
   * the per-conversation All/Mentions/None gate (B14) runs. Optional: a surface
   * with no conversation concept simply omits it.
   */
  scopeKey?: string;
}

export interface MentionResult {
  /** Handles parsed out of the text, after the cap. */
  handles: string[];
  /** User ids actually dispatched to. */
  notified: string[];
  /** Why the rest were dropped — one counter per rule, for observability. */
  dropped: {
    /** Handles past {@link MAX_MENTIONS}. */
    overCap: number;
    /** Handles that match no user. */
    unresolved: number;
    /** The author mentioning themselves. */
    self: number;
    /** Blocked in either direction. */
    blocked: number;
    /** Not in the room's audience. */
    invisible: number;
  };
}

const EMPTY_DROPS: MentionResult['dropped'] = {
  overCap: 0,
  unresolved: 0,
  self: 0,
  blocked: 0,
  invisible: 0,
};

/** `preview` column is VarChar(280); truncate here so no caller has to remember. */
const PREVIEW_MAX = 280;

/* -------------------------------------------------------------------------- */
/* Audience helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The audience of a group chat: its member ids.
 *
 * Kept next to the rule it feeds rather than in the group-chat module, so that
 * "who can be mentioned into a group" has exactly one definition. A caller that
 * already has the member list (a socket hub with the room in memory) should pass
 * `{ kind: 'members', memberIds }` directly instead of paying for this query.
 */
export async function groupChatAudience(groupId: string): Promise<MentionAudience> {
  const members = await prisma.groupChatMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return { kind: 'members', memberIds: members.map((m) => m.userId) };
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

export interface ResolvedMention {
  id: string;
  handle: string;
}

/**
 * Map handles to users, case-insensitively.
 *
 * One query for the whole set — a per-handle lookup would make a ten-mention
 * message ten round trips, which is how a mention fan-out ends up on the
 * critical path of a chat send.
 */
export async function resolveHandles(handles: readonly string[]): Promise<ResolvedMention[]> {
  if (handles.length === 0) return [];
  const rows = await prisma.user.findMany({
    where: { OR: handles.map((h) => ({ handle: { equals: h, mode: 'insensitive' as const } })) },
    select: { id: true, handle: true },
  });
  return rows
    .filter((r): r is { id: string; handle: string } => typeof r.handle === 'string')
    .map((r) => ({ id: r.id, handle: r.handle.toLowerCase() }));
}

/**
 * Ids from `candidateIds` that are blocked in either direction relative to
 * `authorId`.
 *
 * Both directions on purpose. "They blocked me" is the obvious case; "I blocked
 * them" matters too, because delivering a mention from someone you blocked would
 * re-open the exact channel the block closed — the notification tray.
 */
export async function blockedPairs(
  authorId: string,
  candidateIds: readonly string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: authorId, blockedId: { in: [...candidateIds] } },
        { blockedId: authorId, blockerId: { in: [...candidateIds] } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  const out = new Set<string>();
  for (const row of rows) {
    out.add(row.blockerId === authorId ? row.blockedId : row.blockerId);
  }
  return out;
}

/** Whether `userId` can see the surface this mention was written on. */
export function canSee(userId: string, audience: MentionAudience): boolean {
  if (audience.kind === 'public') return true;
  return audience.memberIds.includes(userId);
}

/* -------------------------------------------------------------------------- */
/* Fan-out                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse, filter and deliver the mentions in `text`.
 *
 * The order of the filters is the order of their cost: cap (free) → resolve (one
 * query) → self (free) → blocks (one query) → visibility (in memory). Running
 * visibility before blocks would be equally correct and strictly more expensive,
 * because the block query would then run for people we were going to drop anyway.
 *
 * Delivery goes through `dispatch`, never `createNotification`, so a mention
 * still obeys the recipient's channel matrix, quiet hours and per-conversation
 * mute. A mention is not important enough to bypass any of those; `urgency:
 * 'critical'` exists for account security, and a notifier that claims it for
 * social traffic is why every app's "important" flag eventually means nothing.
 */
export async function notifyMentions(text: string, ctx: MentionContext): Promise<MentionResult> {
  const result: MentionResult = { handles: [], notified: [], dropped: { ...EMPTY_DROPS } };
  try {
    const all = mentionedHandles(text, Number.POSITIVE_INFINITY);
    const handles = all.slice(0, MAX_MENTIONS);
    result.handles = handles;
    result.dropped.overCap = all.length - handles.length;
    if (handles.length === 0) return result;

    const resolved = await resolveHandles(handles);
    const byHandle = new Set(resolved.map((r) => r.handle));
    result.dropped.unresolved = handles.filter((h) => !byHandle.has(h)).length;

    const notSelf = resolved.filter((r) => r.id !== ctx.authorId);
    result.dropped.self = resolved.length - notSelf.length;
    if (notSelf.length === 0) return result;

    const blocked = await blockedPairs(
      ctx.authorId,
      notSelf.map((r) => r.id),
    );
    const unblocked = notSelf.filter((r) => !blocked.has(r.id));
    result.dropped.blocked = notSelf.length - unblocked.length;

    const visible = unblocked.filter((r) => canSee(r.id, ctx.audience));
    result.dropped.invisible = unblocked.length - visible.length;
    if (visible.length === 0) return result;

    const preview = text.slice(0, PREVIEW_MAX);
    await Promise.all(
      visible.map((user) =>
        dispatch({
          userId: user.id,
          category: 'replies',
          type: 'MENTION',
          actorId: ctx.authorId,
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          preview,
          link: ctx.link,
          // One mention per (author, entity) collapses in the notification list
          // and in any batched flush. Two people mentioning you in the same
          // message is two events; one person editing theirs is not.
          groupKey: `mention:${ctx.entityType}:${ctx.entityId}:${ctx.authorId}`,
          isMention: true,
          ...(ctx.scopeKey ? { scopeKey: ctx.scopeKey } : {}),
        }),
      ),
    );
    result.notified = visible.map((u) => u.id);
    return result;
  } catch (err) {
    console.error('[mentions] notifyMentions failed:', err);
    return result;
  }
}
