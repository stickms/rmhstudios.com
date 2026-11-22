/**
 * Managing a group chat (s04-10): rename, add, remove, transfer, leave. Server-only.
 *
 * Every change runs in one transaction that first takes the group's advisory lock (`group-members:<chatId>`, the
 * same key for all of them, so an add, a removal, a transfer and a leave serialise) and then re-reads
 * `Chat.ownerId`: the owner check is made against the row as it is when the lock is held, never against what the
 * request read earlier. The system lines, realtime events and notifications go out after the commit, best-effort:
 * a failed announcement never undoes a change that was made.
 */

import { refusalBody } from '@/lib/errors/codes';
import { notice } from '@/lib/notifications/notice-keys';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { GROUP_KIND } from '@/lib/chat/chat.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { dispatch } from '@/lib/notify/dispatch.server';
import { getChatAccess, publishChatUpdate } from '@/lib/chat-plus/access.server';
import { postSystemLine } from '@/lib/chat-plus/post.server';
import type { ChatUpdate, SystemAction } from '@/lib/chat-plus/types';
import { revokeInvitesOf } from '@/lib/group-chat/invites-revoke.server';
import { applyCap, isGroupOwner, splitCandidates } from '@/lib/group-chat/manage';
import { canManage, canRemoveMember, pickSuccessor, type ManagerNeed } from '@/lib/group-chat/roles';

type Db = Prisma.TransactionClient;

export type ManageResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      status: 400 | 403 | 404;
      error: string;
    };

const notFound = {
  ok: false,
  status: 404,
  error: 'Not found',
} as const;
const notOwner = {
  ok: false,
  status: 403,
  ...refusalBody('GROUP_OWNER_ONLY'),
} as const;
/** The generic refusal for an admin who reaches for something above admin standing, or for the owner or an admin. */
const forbidden = {
  ok: false,
  status: 403,
  ...refusalBody('GROUP_NOT_ALLOWED'),
} as const;

type NamedUser = Parameters<typeof resolveUserDisplay>[0] & {
  handle: string | null;
};

/** The name the member list shows (custom display name first), else their handle. */
export function displayName(u: NamedUser | null): string | null {
  return (u && (resolveUserDisplay(u).name || u.handle)) || null;
}

/** Take the group's lock, then read it. Null when it is gone (or is not a group). */
export async function lockedGroup(tx: Db, chatId: string) {
  await lockKey(tx, `group-members:${chatId}`);
  return tx.chat.findFirst({
    where: {
      id: chatId,
      kind: GROUP_KIND,
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
  });
}

/** Null when `actorId` owns the group; otherwise the refusal: a stranger to the group is told it does not exist. */
export async function refuseUnlessOwner(
  tx: Db,
  group: {
    id: string;
    ownerId: string | null;
  },
  actorId: string,
) {
  if (isGroupOwner(group.ownerId, actorId)) return null;
  const member = await tx.chatMember.findUnique({
    where: {
      chatId_userId: {
        chatId: group.id,
        userId: actorId,
      },
    },
    select: {
      id: true,
    },
  });
  return member ? notOwner : notFound;
}

/**
 * Null when `actorId` may take an action that needs `need` (s07-04); otherwise the refusal. The role is read from the
 * member's own row, so called after `lockedGroup` it is the role as it is when the lock is held: an admin demoted a
 * moment ago is refused. A stranger to the group is told it does not exist; a member without standing gets 403.
 */
export async function refuseUnlessManager(
  tx: Db,
  group: {
    id: string;
    ownerId: string | null;
  },
  actorId: string,
  need: ManagerNeed,
) {
  if (isGroupOwner(group.ownerId, actorId)) return null;
  const member = await tx.chatMember.findUnique({
    where: {
      chatId_userId: {
        chatId: group.id,
        userId: actorId,
      },
    },
    select: {
      id: true,
      role: true,
    },
  });
  if (!member) return notFound;
  return canManage(group.ownerId, member.role, actorId, need) ? null : need === 'owner' ? notOwner : forbidden;
}

/** A system line and/or a realtime update for a group, sent as `senderId` (who must still be a member). */
export async function announce(
  chatId: string,
  senderId: string,
  parts: {
    line?: SystemAction;
    update?: ChatUpdate;
  },
): Promise<void> {
  try {
    const access = await getChatAccess('group', chatId, senderId);
    if (!access) return;
    // The update first: a removed member's stream closes on it, before the line is published.
    if (parts.update) publishChatUpdate(access, parts.update);
    if (parts.line) await postSystemLine(access, senderId, parts.line);
  } catch {
    // best-effort
  }
}

/** The people in `ids` who may join a group `adderId` is adding to: no block, no ban, no tombstone, known. */
export async function refusedForGroup(
  adderId: string,
  idsOrHandles: readonly string[],
  db: Pick<Db, 'user' | 'userBlock'> = prisma,
): Promise<{
  allowed: {
    id: string;
    name: string | null;
  }[];
  refused: number;
}> {
  const wanted = [...new Set(idsOrHandles.map((m) => m.replace(/^@/, '')).filter(Boolean))];
  if (wanted.length === 0)
    return {
      allowed: [],
      refused: 0,
    };
  const users = await db.user.findMany({
    where: {
      OR: wanted.flatMap((m) => [
        {
          id: m,
        },
        {
          handle: m,
        },
      ]),
    },
    select: {
      ...userDisplaySelect,
      bannedUntil: true,
    },
  });
  const ids = users.map((u) => u.id);
  const blocks = await db.userBlock.findMany({
    where: {
      OR: [
        {
          blockerId: adderId,
          blockedId: {
            in: ids,
          },
        },
        {
          blockedId: adderId,
          blockerId: {
            in: ids,
          },
        },
      ],
    },
    select: {
      blockerId: true,
      blockedId: true,
    },
  });
  const blockedIds = new Set(blocks.map((b) => (b.blockerId === adderId ? b.blockedId : b.blockerId)));
  // A request naming the same person by id and by handle counts them once; a name that matches no user is refused.
  const unknown = wanted.filter((m) => !users.some((u) => u.id === m || u.handle === m));
  const split = splitCandidates({
    adderId,
    requestedIds: ids,
    found: users,
    blockedIds,
    tombstoneId: DELETED_USER_ID,
    now: new Date(),
  });
  const nameOf = new Map(users.map((u) => [u.id, displayName(u)]));
  return {
    allowed: split.allowed.map((id) => ({
      id,
      name: nameOf.get(id) ?? null,
    })),
    refused: split.refused + unknown.length,
  };
}

export async function renameGroup(
  actorId: string,
  chatId: string,
  name: string,
): Promise<
  ManageResult<{
    name: string;
  }>
> {
  const trimmed = name.trim();
  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const refusal = await refuseUnlessManager(tx, group, actorId, 'admin');
    if (refusal) return refusal;
    if (group.name === trimmed)
      return {
        ok: true,
        changed: false,
      } as const;
    await tx.chat.update({
      where: {
        id: chatId,
      },
      data: {
        name: trimmed,
      },
    });
    return {
      ok: true,
      changed: true,
    } as const;
  });
  if (!done.ok) return done;
  if (done.changed) {
    await announce(chatId, actorId, {
      line: {
        action: 'rename',
        actorId,
        name: trimmed,
      },
      update: {
        kind: 'group',
        chatId,
        op: 'group',
        change: 'rename',
      },
    });
  }
  return {
    ok: true,
    value: {
      name: trimmed,
    },
  };
}

export async function addMembers(
  actorId: string,
  chatId: string,
  idsOrHandles: readonly string[],
): Promise<
  ManageResult<{
    added: number;
    refused: number;
  }>
> {
  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const refusal = await refuseUnlessManager(tx, group, actorId, 'admin');
    if (refusal) return refusal;
    const vetted = await refusedForGroup(actorId, idsOrHandles, tx);
    const current = await tx.chatMember.findMany({
      where: {
        chatId,
      },
      select: {
        userId: true,
      },
    });
    const inGroup = new Set(current.map((m) => m.userId));
    // Someone already in the group is neither added nor refused.
    const fresh = vetted.allowed.filter((u) => !inGroup.has(u.id));
    const capped = applyCap(
      fresh.map((u) => u.id),
      current.length,
    );
    const joining = fresh.filter((u) => capped.join.includes(u.id));
    if (joining.length > 0) {
      // The owner adding someone back lifts the removal that kept an invite link from bringing them in (s06-09).
      await tx.chatRemoval.deleteMany({
        where: {
          chatId,
          userId: {
            in: joining.map((u) => u.id),
          },
        },
      });
      await tx.chatMember.createMany({
        data: joining.map((u) => ({
          chatId,
          userId: u.id,
        })),
        skipDuplicates: true,
      });
    }
    return {
      ok: true,
      joined: joining,
      refused: vetted.refused + capped.refused,
      groupName: group.name,
    } as const;
  });
  if (!done.ok) return done;

  if (done.joined.length > 0) {
    const actor = await prisma.user
      .findUnique({
        where: {
          id: actorId,
        },
        select: userDisplaySelect,
      })
      .catch(() => null);
    const actorName = displayName(actor) ?? 'Someone';
    const groupName = done.groupName ?? 'a group chat';
    for (const [i, u] of done.joined.entries()) {
      await announce(chatId, actorId, {
        line: {
          action: 'add',
          actorId,
          targetId: u.id,
          targetName: u.name,
        },
        // One refresh for the whole batch is enough.
        ...(i === done.joined.length - 1
          ? {
              update: {
                kind: 'group',
                chatId,
                op: 'group',
                change: 'members',
              } as const,
            }
          : {}),
      });
      await dispatch({
        userId: u.id,
        category: 'social',
        type: 'SYSTEM',
        actorId: null,
        entityType: 'group_chat',
        entityId: chatId,
        preview: notice('group-added', { actor: actorName, group: groupName }),
        link: `/groups/${chatId}`,
      });
    }
  }
  return {
    ok: true,
    value: {
      added: done.joined.length,
      refused: done.refused,
    },
  };
}

export async function removeMember(actorId: string, chatId: string, targetId: string): Promise<ManageResult<null>> {
  if (targetId === actorId)
    return {
      ok: false,
      status: 400,
      ...refusalBody('GROUP_USE_LEAVE'),
    };
  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const refusal = await refuseUnlessManager(tx, group, actorId, 'admin');
    if (refusal) return refusal;
    const target = await tx.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: targetId,
        },
      },
      select: {
        id: true,
        role: true,
        user: {
          select: userDisplaySelect,
        },
      },
    });
    if (!target) return notFound;
    // An admin removes ordinary members only; the owner removes admins too (s07-04). Checked under the lock.
    if (
      !canRemoveMember(group.ownerId, actorId, {
        userId: targetId,
        role: target.role,
      })
    )
      return forbidden;
    await tx.chatMember.delete({
      where: {
        id: target.id,
      },
    });
    // Remember the removal so a live invite link cannot bring them back (s06-09); leaving writes nothing.
    await tx.chatRemoval.upsert({
      where: {
        chatId_userId: {
          chatId,
          userId: targetId,
        },
      },
      create: {
        chatId,
        userId: targetId,
      },
      update: {
        removedAt: new Date(),
      },
    });
    // An admin's links go with their standing (s07-04).
    if (target.role === 'admin') await revokeInvitesOf(tx, chatId, targetId);
    return {
      ok: true,
      targetName: displayName(target.user),
    } as const;
  });
  if (!done.ok) return done;
  await announce(chatId, actorId, {
    update: {
      kind: 'group',
      chatId,
      op: 'group',
      change: 'removed',
      userId: targetId,
    },
  });
  await announce(chatId, actorId, {
    line: {
      action: 'remove',
      actorId,
      targetId,
      targetName: done.targetName,
    },
    update: {
      kind: 'group',
      chatId,
      op: 'group',
      change: 'members',
    },
  });
  return {
    ok: true,
    value: null,
  };
}

export async function transferOwnership(
  actorId: string,
  chatId: string,
  targetId: string,
): Promise<ManageResult<null>> {
  if (targetId === actorId)
    return {
      ok: false,
      status: 400,
      ...refusalBody('GROUP_ALREADY_OWNER'),
    };
  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const refusal = await refuseUnlessOwner(tx, group, actorId);
    if (refusal) return refusal;
    const target = await tx.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: targetId,
        },
      },
      select: {
        role: true,
        user: {
          select: userDisplaySelect,
        },
      },
    });
    if (!target) return notFound;
    await tx.chat.update({
      where: {
        id: chatId,
      },
      data: {
        ownerId: targetId,
      },
    });
    // The new owner is no admin row (the owner sits above admins). A transfer to an admin keeps the old owner as an
    // admin, so the admin count does not move; a transfer to a member leaves the admin list as it is (s07-04).
    if (target.role === 'admin') {
      await tx.chatMember.update({
        where: {
          chatId_userId: {
            chatId,
            userId: targetId,
          },
        },
        data: {
          role: 'member',
        },
      });
      await tx.chatMember.update({
        where: {
          chatId_userId: {
            chatId,
            userId: actorId,
          },
        },
        data: {
          role: 'admin',
        },
      });
    } else {
      // Handing it to an ordinary member leaves the old owner without standing: their links go (s06-09).
      await revokeInvitesOf(tx, chatId, actorId);
    }
    return {
      ok: true,
      targetName: displayName(target.user),
    } as const;
  });
  if (!done.ok) return done;
  await announce(chatId, actorId, {
    line: {
      action: 'owner',
      actorId,
      targetId,
      targetName: done.targetName,
    },
    update: {
      kind: 'group',
      chatId,
      op: 'group',
      change: 'owner',
    },
  });
  return {
    ok: true,
    value: null,
  };
}

export type LeaveOutcome = {
  disbanded: boolean;
  newOwnerId: string | null;
};

/**
 * Leave a group. If the owner leaves, ownership passes to the earliest-joined admin, else the earliest-joined member; the last one out
 * deletes the group. Shared by the Leave endpoint and account erasure.
 */
export async function leaveGroup(userId: string, chatId: string): Promise<ManageResult<LeaveOutcome>> {
  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const membership = await tx.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        id: true,
        role: true,
      },
    });
    if (!membership)
      return {
        ok: false,
        status: 400,
        ...refusalBody('GROUP_NOT_A_MEMBER'),
      } as const;
    await tx.chatMember.delete({
      where: {
        id: membership.id,
      },
    });
    // An admin who leaves takes their live links with them (s07-04).
    if (membership.role === 'admin') await revokeInvitesOf(tx, chatId, userId);
    const rest = await tx.chatMember.findMany({
      where: {
        chatId,
      },
      select: {
        userId: true,
        joinedAt: true,
        role: true,
      },
    });
    if (rest.length === 0) {
      await tx.chat.delete({
        where: {
          id: chatId,
        },
      });
      return {
        ok: true,
        disbanded: true,
        newOwnerId: null,
        newOwnerName: null,
      } as const;
    }
    if (!isGroupOwner(group.ownerId, userId)) {
      return {
        ok: true,
        disbanded: false,
        newOwnerId: null,
        newOwnerName: null,
      } as const;
    }
    // Read under the lock with the leaver gone: the earliest admin, else the earliest member (s07-04).
    const successor = pickSuccessor(rest, userId);
    const heirId = successor?.userId;
    if (!heirId)
      return {
        ok: true,
        disbanded: false,
        newOwnerId: null,
        newOwnerName: null,
      } as const;
    await tx.chat.update({
      where: {
        id: chatId,
      },
      data: {
        ownerId: heirId,
      },
    });
    await revokeInvitesOf(tx, chatId, userId);
    // An owner is no admin row.
    if (successor?.wasAdmin)
      await tx.chatMember.update({
        where: {
          chatId_userId: {
            chatId,
            userId: heirId,
          },
        },
        data: {
          role: 'member',
        },
      });
    const heir = await tx.user.findUnique({
      where: {
        id: heirId,
      },
      select: userDisplaySelect,
    });
    return {
      ok: true,
      disbanded: false,
      newOwnerId: heirId,
      newOwnerName: displayName(heir),
    } as const;
  });
  if (!done.ok) return done;
  if (!done.disbanded) {
    // The leaver is gone, so the new owner (or any remaining member, if ownership did not move) speaks for the group.
    let announcer = done.newOwnerId;
    if (!announcer) {
      const remaining = await prisma.chatMember.findFirst({
        where: {
          chatId,
        },
        select: {
          userId: true,
        },
      });
      announcer = remaining?.userId ?? null;
    }
    if (announcer) {
      await announce(chatId, announcer, {
        ...(done.newOwnerId
          ? {
              line: {
                action: 'owner' as const,
                actorId: done.newOwnerId,
                targetId: done.newOwnerId,
                targetName: done.newOwnerName,
              },
            }
          : {}),
        update: {
          kind: 'group',
          chatId,
          op: 'group',
          change: done.newOwnerId ? 'owner' : 'members',
        },
      });
    }
  }
  return {
    ok: true,
    value: {
      disbanded: done.disbanded,
      newOwnerId: done.newOwnerId,
    },
  };
}

/** Account erasure: leave every group, so ownership passes on exactly as for a member who left. Idempotent. */
export async function leaveAllGroups(userId: string): Promise<void> {
  const rows = await prisma.chatMember.findMany({
    where: {
      userId,
      chat: {
        kind: GROUP_KIND,
      },
    },
    select: {
      chatId: true,
    },
  });
  // Tests that stub prisma with a recording proxy answer a list read with an op object, not rows.
  if (!Array.isArray(rows)) return;
  for (const { chatId } of rows) await leaveGroup(userId, chatId);
}
