/**
 * The one chat model, read and written here. Server-only.
 *
 * A DM and a group chat are both a `Chat` (`kind` 'dm' | 'group') with
 * `ChatMember` rows; their messages, reactions and poll votes live in one table
 * each (`ChatMessage`, `ChatMessageReaction`, `ChatPollVote`). The old
 * Conversation/GroupChat family is copied in and mirrored by migration
 * 20261120040000_chat_unify and is not read or written any more.
 *
 * The one rule this module exists to hold: **every lookup names the kind.** A
 * DM id and a group id are the same shape and live in the same table, so a
 * group endpoint that asked only "is this user a member of chat X" would accept
 * a DM id — and let a participant post group-style into a DM past the DM
 * privacy and block checks. `findDm` only ever returns a `kind = 'dm'` chat and
 * `findGroupMembership` only a `kind = 'group'` one; nothing else in the
 * codebase looks a chat up by id.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { hiddenFromRecipient, type RequestFacts } from '@/lib/messages/requests';

export type ChatDb = Prisma.TransactionClient | typeof prisma;

export const DM_KIND = 'dm';
export const GROUP_KIND = 'group';

/** The ordered pair key a DM is unique on (callers sort the pair, as before). */
export function dmKeyOf(participantOneId: string, participantTwoId: string): string {
  return `${participantOneId}:${participantTwoId}`;
}

/** A DM in the shape the code written against `Conversation` reads. */
export interface DmRow {
  id: string;
  participantOneId: string;
  participantTwoId: string;
  disappearAfterSec: number | null;
  themeKey: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  /** The message request on this chat, if it has one (sprint 04 #16). */
  request?: RequestFacts | null;
}

export const dmChatSelect = {
  id: true,
  disappearAfterSec: true,
  themeKey: true,
  lastMessageAt: true,
  createdAt: true,
  members: { select: { userId: true, slot: true }, orderBy: { slot: 'asc' } },
  messageRequest: { select: { senderId: true, recipientId: true, status: true, decidedAt: true } },
} as const satisfies Prisma.ChatSelect;

type DmChat = Prisma.ChatGetPayload<{ select: typeof dmChatSelect }>;

/**
 * The two participants, in the old participantOne/participantTwo order. Saved
 * Messages (a chat with yourself) has one member, who is both.
 */
export function toDmRow(chat: DmChat): DmRow | null {
  const one = chat.members.find((m) => m.slot === 1) ?? chat.members[0];
  if (!one) return null;
  const two = chat.members.find((m) => m.slot === 2) ?? one;
  return {
    id: chat.id,
    participantOneId: one.userId,
    participantTwoId: two.userId,
    disappearAfterSec: chat.disappearAfterSec,
    themeKey: chat.themeKey,
    lastMessageAt: chat.lastMessageAt,
    createdAt: chat.createdAt,
    request: chat.messageRequest ?? null,
  };
}

/** A DM by id. Never returns a group chat. */
export async function findDm(id: string, db: ChatDb = prisma): Promise<DmRow | null> {
  const chat = await db.chat.findFirst({ where: { id, kind: DM_KIND }, select: dmChatSelect });
  return chat ? toDmRow(chat) : null;
}

/**
 * A DM by id, only if `userId` is one of its participants. A chat whose message
 * request still waits for `userId` to decide does not exist for them: it is
 * answered from the Requests folder alone, so nothing else can open it.
 */
export async function findDmFor(id: string, userId: string, db: ChatDb = prisma): Promise<DmRow | null> {
  const dm = await findDm(id, db);
  if (!dm) return null;
  if (dm.participantOneId !== userId && dm.participantTwoId !== userId) return null;
  return hiddenFromRecipient(dm.request, userId) ? null : dm;
}

/** A DM by its ordered pair. */
export async function findDmByPair(
  participantOneId: string,
  participantTwoId: string,
  db: ChatDb = prisma,
): Promise<DmRow | null> {
  const chat = await db.chat.findUnique({
    where: { dmKey: dmKeyOf(participantOneId, participantTwoId) },
    select: { ...dmChatSelect, kind: true },
  });
  return chat && chat.kind === DM_KIND ? toDmRow(chat) : null;
}

/**
 * The DM for this ordered pair, created on first use (what
 * `conversation.upsert` on the pair did). Two racing creates meet on the
 * `dmKey` unique index; the loser reads the winner's row.
 */
export async function upsertDm(
  participantOneId: string,
  participantTwoId: string,
  db: ChatDb = prisma,
): Promise<DmRow> {
  const existing = await findDmByPair(participantOneId, participantTwoId, db);
  if (existing) return existing;
  const members =
    participantOneId === participantTwoId
      ? [{ userId: participantOneId, slot: 1 }]
      : [
          { userId: participantOneId, slot: 1 },
          { userId: participantTwoId, slot: 2 },
        ];
  try {
    const chat = await db.chat.create({
      data: {
        kind: DM_KIND,
        dmKey: dmKeyOf(participantOneId, participantTwoId),
        members: { create: members },
      },
      select: dmChatSelect,
    });
    const row = toDmRow(chat);
    if (row) return row;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
  const raced = await findDmByPair(participantOneId, participantTwoId, db);
  if (!raced) throw new Error('DM upsert lost a race and found no row');
  return raced;
}

/** `where` for "DMs this user is a participant in". */
export function dmsOf(userId: string): Prisma.ChatWhereInput {
  return { kind: DM_KIND, members: { some: { userId } } };
}

/**
 * `where` for the chats a recipient's inbox may show (sprint 04 #16): not one whose
 * message request waits for them (it lives in the Requests folder), and not one
 * they declined unless they have written in it since. Combine with `dmsOf` through
 * `AND`; with no requests anywhere it matches every chat.
 */
export function inboxVisibleTo(userId: string): Prisma.ChatWhereInput {
  return {
    NOT: [
      { messageRequest: { is: { recipientId: userId, status: { in: ['pending', 'draft'] } } } },
      {
        AND: [
          { messageRequest: { is: { recipientId: userId, status: 'declined' } } },
          { messages: { none: { senderId: userId } } },
        ],
      },
    ],
  };
}

/** `where` for "group chats this user is a member of". */
export function groupsOf(userId: string): Prisma.ChatWhereInput {
  return { kind: GROUP_KIND, members: { some: { userId } } };
}

/**
 * `userId`'s membership of group chat `groupId`, or null (also null for a DM
 * id: a DM is never a group). `select` picks the member columns.
 */
export async function findGroupMembership<S extends Prisma.ChatMemberSelect>(
  groupId: string,
  userId: string,
  select: S,
  db: ChatDb = prisma,
): Promise<Prisma.ChatMemberGetPayload<{ select: S }> | null> {
  return db.chatMember.findFirst({
    where: { chatId: groupId, userId, chat: { kind: GROUP_KIND } },
    select,
  }) as Promise<Prisma.ChatMemberGetPayload<{ select: S }> | null>;
}
