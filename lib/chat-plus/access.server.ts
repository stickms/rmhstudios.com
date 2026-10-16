/**
 * Who may touch a chat, and how to reach everyone in it. Server-only.
 *
 * DMs and group chats are separate models, so every P04 feature goes through
 * this one adapter instead of branching on `kind` at each call site.
 */

import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { publishGroupEvent } from '@/lib/group-events';
import { scopeKeyOf, type ChatKind, type ChatUpdate } from '@/lib/chat-plus/types';

export interface ChatAccess {
  kind: ChatKind;
  id: string;
  viewerId: string;
  /** `dm:<id>` / `group:<id>`. */
  scopeKey: string;
  /** DMs only: both participants (equal for a Saved Messages chat). */
  participants: [string, string] | null;
  /** DMs only: the other participant (the viewer themselves in Saved Messages). */
  otherId: string | null;
  /** A note-to-self conversation (M2). */
  isSelf: boolean;
  disappearAfterSec: number | null;
  themeKey: string | null;
}

/** The chat, if `userId` is a participant / member. Null reads as "not found". */
export async function getChatAccess(
  kind: ChatKind,
  id: string,
  userId: string,
): Promise<ChatAccess | null> {
  if (kind === 'dm') {
    const c = await prisma.conversation.findUnique({
      where: { id },
      select: {
        participantOneId: true,
        participantTwoId: true,
        disappearAfterSec: true,
        themeKey: true,
      },
    });
    if (!c || (c.participantOneId !== userId && c.participantTwoId !== userId)) return null;
    const otherId = c.participantOneId === userId ? c.participantTwoId : c.participantOneId;
    return {
      kind,
      id,
      viewerId: userId,
      scopeKey: scopeKeyOf(kind, id),
      participants: [c.participantOneId, c.participantTwoId],
      otherId,
      isSelf: c.participantOneId === c.participantTwoId,
      disappearAfterSec: c.disappearAfterSec,
      themeKey: c.themeKey,
    };
  }
  const m = await prisma.groupChatMember.findUnique({
    where: { groupId_userId: { groupId: id, userId } },
    select: { group: { select: { disappearAfterSec: true, themeKey: true } } },
  });
  if (!m) return null;
  return {
    kind,
    id,
    viewerId: userId,
    scopeKey: scopeKeyOf(kind, id),
    participants: null,
    otherId: null,
    isSelf: false,
    disappearAfterSec: m.group.disappearAfterSec,
    themeKey: m.group.themeKey,
  };
}

/** Everyone who should hear about a change in this chat (DMs: both sides, once). */
export function dmAudience(access: ChatAccess): string[] {
  if (!access.participants) return [];
  return [...new Set(access.participants)];
}

/** Publish a non-message change on the chat's existing realtime channel. */
export function publishChatUpdate(access: ChatAccess, update: ChatUpdate): void {
  if (access.kind === 'dm') {
    for (const uid of dmAudience(access)) notifyUser(uid, { type: 'chat-update', update });
  } else {
    publishGroupEvent(access.id, { type: 'chat-update', update });
  }
}
