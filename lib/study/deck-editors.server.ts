/**
 * Editors on a flashcard deck (s11-10): the owner invites a member by handle (up to ten editors a deck, fifty open
 * invitations an owner), the invitee accepts or declines, the owner removes and the editor leaves.
 *
 * The caps are check-then-insert, so each runs under `lockKey(tx, 'deck-editors:<deckId>')` and then
 * `lockKey(tx, 'deck-invites:<ownerId>')` (always in that order). An invitation lapses after 14 days: that is read at
 * request time (`createdAt` against `inviteCutoff`), never swept, so a lapsed row grants nothing, counts toward no cap
 * and is replaced by a fresh invitation. Only an `accepted` row is access (`deck-access.server.ts`).
 *
 * Refusals never say why a member cannot be invited (a block, a ban and a pending deletion read the same), so the
 * invitation is no way to find out who blocked whom.
 */
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { findUsersByHandles } from '@/lib/handles/lookup.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import {
  DECK_INVITE_MS,
  MAX_DECK_EDITORS,
  MAX_PENDING_DECK_INVITES,
  inviteCutoff,
  type DeckEditorStatus,
} from '@/lib/study/deck-access';
import { deckRole } from '@/lib/study/deck-access.server';
import type { DeckEditorRow, DeckEditorsView, DeckInvitation } from '@/lib/study/deck-editors';

/** The entity type of the inbox rows these write; its label is in `components/feed/notification-labels.ts`. */
export const DECK_EDITOR_ENTITY = 'deck-editor';

export type EditorResult<T = object> =
  ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409 | 410; error: string; code: ErrorCode };

const refuse = (status: 400 | 403 | 404 | 409 | 410, code: ErrorCode, params?: { max?: number }) =>
  ({ ok: false, status, ...refusalBody(code, params) }) as const;

const NOT_FOUND = refuse(404, 'NOT_FOUND');

type MemberName = { name: string | null; handle: string | null; profile: { displayName: string | null } | null };

const nameOf = (m: MemberName): string => m.profile?.displayName ?? m.name ?? m.handle ?? '';
/** A member as a name: the chip fields and the display name they chose. */
export const MEMBER_NAME = { ...userChipSelect, profile: { select: { displayName: true } } } as const;

/** A member as a name, with what the rules read of their account: a ban and a pending deletion. */
const MEMBER_STATE = { ...MEMBER_NAME, bannedUntil: true, deletionScheduledAt: true } as const;

/** Whether either of two members has blocked the other. */
async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

const banned = (m: { bannedUntil: Date | null }, now: Date) =>
  !!m.bannedUntil && m.bannedUntil.getTime() > now.getTime();

/** Best-effort: a notice that fails to send never fails the invitation. */
async function tell(input: Parameters<typeof createNotification>[0]): Promise<void> {
  try {
    await createNotification(input);
  } catch (error) {
    console.error('[deck-editors] could not notify', error);
  }
}

/**
 * Invite a member (by handle) to edit one of the owner's decks. Refused for a deck that is not the owner's (an editor
 * cannot invite), a copy of another member's deck, the owner themselves, a member blocked either way, banned or with a
 * deletion pending, someone already invited, and past either cap.
 */
export async function inviteEditor(
  ownerId: string,
  deckId: string,
  handle: string,
  now: Date = new Date(),
): Promise<EditorResult<{ editor: DeckEditorRow }>> {
  if ((await deckRole(ownerId, deckId)) !== 'owner') return NOT_FOUND;
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { title: true, clonedFromId: true },
  });
  if (!deck) return NOT_FOUND;
  // A copy gets the author's cards by sync: it takes no editors.
  if (deck.clonedFromId) return refuse(400, 'DECK_EDITOR_COPY');

  const [match] = await findUsersByHandles([handle]);
  if (!match) return NOT_FOUND;
  if (match.id === ownerId) return refuse(400, 'INVALID_INPUT');
  const target = await prisma.user.findUnique({
    where: { id: match.id },
    select: MEMBER_STATE,
  });
  if (!target) return NOT_FOUND;
  if (banned(target, now) || target.deletionScheduledAt || (await blockedEitherWay(ownerId, target.id))) {
    return refuse(403, 'DECK_EDITOR_UNAVAILABLE');
  }

  const cutoff = inviteCutoff(now);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `deck-editors:${deckId}`);
    await lockKey(tx, `deck-invites:${ownerId}`);
    const existing = await tx.deckEditor.findUnique({
      where: { deckId_userId: { deckId, userId: target.id } },
      select: { status: true, createdAt: true },
    });
    if (existing) {
      const open = existing.status === 'accepted' || existing.createdAt.getTime() >= cutoff.getTime();
      if (open) return refuse(409, 'DECK_EDITOR_ALREADY');
      // A lapsed invitation is replaced by this one.
      await tx.deckEditor.deleteMany({ where: { deckId, userId: target.id, status: 'pending' } });
    }
    const holding = await tx.deckEditor.count({
      where: { deckId, OR: [{ status: 'accepted' }, { status: 'pending', createdAt: { gte: cutoff } }] },
    });
    if (holding >= MAX_DECK_EDITORS) return refuse(409, 'DECK_EDITOR_FULL', { max: MAX_DECK_EDITORS });
    const waiting = await tx.deckEditor.count({
      where: { invitedById: ownerId, status: 'pending', createdAt: { gte: cutoff } },
    });
    if (waiting >= MAX_PENDING_DECK_INVITES) {
      return refuse(409, 'DECK_EDITOR_INVITES_FULL', { max: MAX_PENDING_DECK_INVITES });
    }
    const row = await tx.deckEditor.create({
      data: { deckId, userId: target.id, invitedById: ownerId, status: 'pending' },
      select: { createdAt: true },
    });
    return { ok: true, createdAt: row.createdAt } as const;
  });
  if (!outcome.ok) return outcome;

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: MEMBER_NAME });
  await tell({
    userId: target.id,
    actorId: ownerId,
    type: 'SYSTEM',
    entityType: DECK_EDITOR_ENTITY,
    entityId: deckId,
    preview: notice('deck-editor-invited', { name: owner ? nameOf(owner) : '', deck: deck.title }),
    link: `/study/${deckId}`,
  });
  return {
    ok: true,
    editor: {
      userId: target.id,
      name: nameOf(target),
      handle: target.handle,
      status: 'pending',
      invitedAt: outcome.createdAt.toISOString(),
      acceptedAt: null,
    },
  };
}

/** The invitee accepts: pending and not lapsed, compare-and-set, so a second press or a withdrawn row changes nothing. */
export async function acceptInvitation(
  userId: string,
  deckId: string,
  now: Date = new Date(),
): Promise<EditorResult<{ accepted: true }>> {
  const row = await prisma.deckEditor.findUnique({
    where: { deckId_userId: { deckId, userId } },
    select: {
      status: true,
      createdAt: true,
      invitedById: true,
      deck: { select: { title: true, userId: true, clonedFromId: true } },
    },
  });
  if (!row) return NOT_FOUND;
  if (row.status === 'accepted') return { ok: true, accepted: true };
  if (row.createdAt.getTime() < inviteCutoff(now).getTime()) return refuse(410, 'GONE');
  const [me, owner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: MEMBER_STATE }),
    prisma.user.findUnique({
      where: { id: row.deck.userId },
      select: MEMBER_STATE,
    }),
  ]);
  if (!me || !owner) return NOT_FOUND;
  // A deleted account is a banned one, so an invitation from it cannot be taken up either.
  if (
    banned(me, now) ||
    banned(owner, now) ||
    owner.deletionScheduledAt ||
    (await blockedEitherWay(userId, row.deck.userId))
  ) {
    return refuse(403, 'FORBIDDEN');
  }
  const won = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `deck-editors:${deckId}`);
    const done = await tx.deckEditor.updateMany({
      where: { deckId, userId, status: 'pending', createdAt: { gte: inviteCutoff(now) } },
      data: { status: 'accepted', acceptedAt: now },
    });
    return done.count === 1;
  });
  if (!won) {
    // Another request accepted it, or the owner withdrew it, between the read and the write.
    const again = await prisma.deckEditor.findUnique({
      where: { deckId_userId: { deckId, userId } },
      select: { status: true },
    });
    return again?.status === 'accepted' ? { ok: true, accepted: true } : NOT_FOUND;
  }
  await tell({
    userId: row.deck.userId,
    actorId: userId,
    type: 'SYSTEM',
    entityType: DECK_EDITOR_ENTITY,
    entityId: deckId,
    preview: notice('deck-editor-accepted', { name: nameOf(me), deck: row.deck.title }),
    link: `/study/${deckId}`,
  });
  return { ok: true, accepted: true };
}

/** The invitee declines: the pending row goes (no notice to the owner). */
export async function declineInvitation(userId: string, deckId: string): Promise<EditorResult> {
  const { count } = await prisma.deckEditor.deleteMany({ where: { deckId, userId, status: 'pending' } });
  return count === 0 ? NOT_FOUND : { ok: true };
}

/** The owner removes an editor, or withdraws a pending invitation. The deck's cards and the member's reviews stay. */
export async function removeEditor(ownerId: string, deckId: string, editorId: string): Promise<EditorResult> {
  if ((await deckRole(ownerId, deckId)) !== 'owner') return NOT_FOUND;
  const { count } = await prisma.deckEditor.deleteMany({ where: { deckId, userId: editorId } });
  return count === 0 ? NOT_FOUND : { ok: true };
}

/**
 * A block ends deck editing between the pair (accepted and pending rows, whichever of them owns the deck), in the
 * block's own transaction. `deckRole` checks blocks too; this removes the rows the database-filter readers (the queue
 * and the statistics lists) trust.
 */
export async function endEditingBetween(tx: Pick<typeof prisma, 'deckEditor'>, a: string, b: string): Promise<void> {
  await tx.deckEditor.deleteMany({
    where: {
      OR: [
        { userId: b, deck: { userId: a } },
        { userId: a, deck: { userId: b } },
      ],
    },
  });
}

/** An editor leaves. Only an accepted row: a pending invitation is declined instead. */
export async function leaveDeck(userId: string, deckId: string): Promise<EditorResult> {
  const { count } = await prisma.deckEditor.deleteMany({ where: { deckId, userId, status: 'accepted' } });
  return count === 0 ? NOT_FOUND : { ok: true };
}

/**
 * The deck's editors as its viewer may read them: every open row for the owner, the owner and a count for an editor.
 * Anyone else (a pending invitee included) gets nothing.
 */
export async function listEditors(
  userId: string,
  deckId: string,
  now: Date = new Date(),
): Promise<EditorResult<{ view: DeckEditorsView }>> {
  const role = await deckRole(userId, deckId);
  if (role === null) return NOT_FOUND;
  const cutoff = inviteCutoff(now);
  if (role === 'owner') {
    const rows = await prisma.deckEditor.findMany({
      where: { deckId, OR: [{ status: 'accepted' }, { status: 'pending', createdAt: { gte: cutoff } }] },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      take: MAX_DECK_EDITORS + MAX_PENDING_DECK_INVITES,
      select: { userId: true, status: true, createdAt: true, acceptedAt: true, user: { select: MEMBER_NAME } },
    });
    return {
      ok: true,
      view: {
        role: 'owner',
        max: MAX_DECK_EDITORS,
        editors: (Array.isArray(rows) ? rows : []).map((r) => ({
          userId: r.userId,
          name: nameOf(r.user),
          handle: r.user.handle,
          status: r.status === 'accepted' ? ('accepted' as DeckEditorStatus) : ('pending' as DeckEditorStatus),
          invitedAt: r.createdAt.toISOString(),
          acceptedAt: r.acceptedAt?.toISOString() ?? null,
        })),
      },
    };
  }
  const [deck, count] = await Promise.all([
    prisma.flashcardDeck.findUnique({ where: { id: deckId }, select: { user: { select: MEMBER_NAME } } }),
    prisma.deckEditor.count({ where: { deckId, status: 'accepted' } }),
  ]);
  if (!deck) return NOT_FOUND;
  return { ok: true, view: { role: 'editor', owner: { name: nameOf(deck.user), handle: deck.user.handle }, count } };
}

/** How many accepted editors each of these decks has: "By <owner> with N editors" on a public deck. No names. */
export async function editorCounts(deckIds: readonly string[]): Promise<Map<string, number>> {
  if (deckIds.length === 0) return new Map();
  const rows = await prisma.deckEditor.groupBy({
    by: ['deckId'],
    where: { deckId: { in: [...deckIds] }, status: 'accepted' },
    _count: { _all: true },
  });
  return new Map((Array.isArray(rows) ? rows : []).map((r) => [r.deckId, r._count._all]));
}

/** The member's open invitations, newest first: only the deck's title and the owner's name, nothing of the deck. */
export async function listInvitations(userId: string, now: Date = new Date()): Promise<DeckInvitation[]> {
  const rows = await prisma.deckEditor.findMany({
    where: { userId, status: 'pending', createdAt: { gte: inviteCutoff(now) } },
    orderBy: [{ createdAt: 'desc' }, { deckId: 'asc' }],
    take: MAX_PENDING_DECK_INVITES,
    select: { deckId: true, createdAt: true, deck: { select: { title: true, user: { select: MEMBER_NAME } } } },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    deckId: r.deckId,
    title: r.deck.title,
    owner: { name: nameOf(r.deck.user), handle: r.deck.user.handle },
    expiresAt: new Date(r.createdAt.getTime() + DECK_INVITE_MS).toISOString(),
  }));
}

/** The member's open invitation to one deck, or null: what the deck page shows a member who is not yet an editor. */
export async function invitationTo(
  userId: string,
  deckId: string,
  now: Date = new Date(),
): Promise<DeckInvitation | null> {
  const row = await prisma.deckEditor.findFirst({
    where: { deckId, userId, status: 'pending', createdAt: { gte: inviteCutoff(now) } },
    select: { deckId: true, createdAt: true, deck: { select: { title: true, user: { select: MEMBER_NAME } } } },
  });
  if (!row) return null;
  return {
    deckId: row.deckId,
    title: row.deck.title,
    owner: { name: nameOf(row.deck.user), handle: row.deck.user.handle },
    expiresAt: new Date(row.createdAt.getTime() + DECK_INVITE_MS).toISOString(),
  };
}

/**
 * The account export's `deckEditors` section: the decks the member edits (title, the owner's display name, when they
 * accepted) and the invitations they sent as an owner. Other members' rows on the member's decks are in the second list
 * only as the invitations the member sent, with the invitee's handle.
 */
export async function exportDeckEditors(userId: string) {
  const [editing, sent] = await Promise.all([
    prisma.deckEditor.findMany({
      where: { userId, status: 'accepted' },
      orderBy: { acceptedAt: 'asc' },
      take: 1000,
      select: { deckId: true, acceptedAt: true, deck: { select: { title: true, user: { select: MEMBER_NAME } } } },
    }),
    prisma.deckEditor.findMany({
      where: { invitedById: userId },
      orderBy: { createdAt: 'asc' },
      take: 1000,
      select: { deckId: true, status: true, createdAt: true, acceptedAt: true, user: { select: { handle: true } } },
    }),
  ]);
  return {
    editing: (Array.isArray(editing) ? editing : []).map((r) => ({
      deckId: r.deckId,
      title: r.deck.title,
      owner: nameOf(r.deck.user),
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    })),
    invitationsSent: (Array.isArray(sent) ? sent : []).map((r) => ({
      deckId: r.deckId,
      editor: r.user.handle,
      status: r.status,
      invitedAt: r.createdAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    })),
  };
}
