/**
 * Invite links for group chats (s06-09). Server-only.
 *
 * The owner makes links (expiry, maximum uses, at most five live); anyone signed in who opens one joins under the
 * group's member lock (`group-members:<chatId>`, the key `addMembers` takes, so the two paths share one cap). Every
 * reason a link cannot be used is the same `refused` result, and nothing about the group leaves `previewInvite` for
 * a code that is invalid, so a link never says who blocked whom nor confirms that a group exists.
 */

import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { userDisplaySelect } from '@/lib/user-display';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import {
  announce,
  displayName,
  lockedGroup,
  refusedForGroup,
  refuseUnlessManager,
} from '@/lib/group-chat/manage.server';
import { canSeeFollowLists } from '@/lib/social/follow-list-privacy.server';
import { GROUP_MEMBER_CAP } from '@/lib/group-chat/manage';
import {
  codeFromBytes,
  expiryDate,
  isInviteCode,
  isInviteLive,
  MAX_LIVE_INVITES,
  type InviteExpiryDays,
  type InviteMaxUses,
  type InviteRow,
} from '@/lib/group-chat/invites';

type Db = Prisma.TransactionClient;

const toRow = (r: {
  id: string;
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  createdAt: Date;
  createdById?: string;
  createdBy?: Parameters<typeof displayName>[0];
}): InviteRow => ({
  id: r.id,
  code: r.code,
  maxUses: r.maxUses,
  uses: r.uses,
  expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
  createdById: r.createdById ?? null,
  createdByName: displayName(r.createdBy ?? null),
});

const SELECT = {
  id: true,
  code: true,
  maxUses: true,
  uses: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

type Result<T> =
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

/** A fresh 10-character base58 code from `crypto.randomBytes`, unbiased. */
export function generateCode(): string {
  for (;;) {
    const code = codeFromBytes(randomBytes(32));
    if (code) return code;
  }
}

/** Owner or admin: make a link. At most five live ones per group; the count is taken under the group's lock. */
export async function createInvite(
  actorId: string,
  chatId: string,
  input: {
    expiresInDays: InviteExpiryDays;
    maxUses: InviteMaxUses;
  },
): Promise<Result<InviteRow>> {
  return prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const refusal = await refuseUnlessManager(tx, group, actorId, 'admin');
    if (refusal) return refusal;
    await lockKey(tx, `group-invites:${chatId}`);
    const now = new Date();
    const existing = await tx.chatInvite.findMany({
      where: {
        chatId,
        revokedAt: null,
      },
      select: SELECT,
    });
    const live = existing.filter((i) => isInviteLive(i, now));
    if (live.length >= MAX_LIVE_INVITES) {
      return {
        ok: false,
        status: 400,
        error: `A group can have ${MAX_LIVE_INVITES} invite links at a time`,
      } as const;
    }
    const row = await tx.chatInvite.create({
      data: {
        chatId,
        createdById: actorId,
        code: generateCode(),
        maxUses: input.maxUses,
        expiresAt: expiryDate(input.expiresInDays, now),
      },
      select: SELECT,
    });
    return {
      ok: true,
      value: toRow(row),
    } as const;
  });
}

/** Owner or admin: the group's live links, newest first, with who made each. */
export async function listInvites(actorId: string, chatId: string): Promise<Result<InviteRow[]>> {
  const group = await prisma.chat.findFirst({
    where: {
      id: chatId,
      kind: 'group',
    },
    select: {
      id: true,
      ownerId: true,
    },
  });
  if (!group) return notFound;
  const refusal = await refuseUnlessManager(prisma, group, actorId, 'admin');
  if (refusal) return refusal;
  const rows = await prisma.chatInvite.findMany({
    where: {
      chatId,
      revokedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      ...SELECT,
      createdById: true,
      createdBy: {
        select: userDisplaySelect,
      },
    },
  });
  const now = new Date();
  return {
    ok: true,
    value: rows.filter((r) => isInviteLive(r, now)).map(toRow),
  };
}

/** Owner or admin, any link: stop new joins through a link. Nobody who joined is removed. Idempotent. */
export async function revokeInvite(actorId: string, chatId: string, inviteId: string): Promise<Result<null>> {
  return prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group) return notFound;
    const refusal = await refuseUnlessManager(tx, group, actorId, 'admin');
    if (refusal) return refusal;
    await tx.chatInvite.updateMany({
      where: {
        id: inviteId,
        chatId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return {
      ok: true,
      value: null,
    } as const;
  });
}

export type RefusalCheck =
  | {
      ok: true;
    }
  | {
      ok: false;
    };

/**
 * Whether `userId` may join `chatId` through a link `creatorId` made: every `addMembers` rule with the creator as the
 * adder (ban, tombstone, block with the creator), plus a block with ANY current member, no removal on record, and a
 * seat left.
 */
async function mayJoin(
  db: Db,
  chatId: string,
  creatorId: string,
  userId: string,
  memberIds: readonly string[],
): Promise<boolean> {
  if (userId === DELETED_USER_ID) return false;
  if (memberIds.length >= GROUP_MEMBER_CAP) return false;
  const removed = await db.chatRemoval.findUnique({
    where: {
      chatId_userId: {
        chatId,
        userId,
      },
    },
    select: {
      userId: true,
    },
  });
  if (removed) return false;
  const vetted = await refusedForGroup(creatorId, [userId], db);
  if (!vetted.allowed.some((u) => u.id === userId)) return false;
  const blocks = await db.userBlock.findFirst({
    where: {
      OR: [
        {
          blockerId: userId,
          blockedId: {
            in: [...memberIds],
          },
        },
        {
          blockedId: userId,
          blockerId: {
            in: [...memberIds],
          },
        },
      ],
    },
    select: {
      blockerId: true,
    },
  });
  return !blocks;
}

export type JoinResult =
  | {
      ok: true;
      chatId: string;
      alreadyMember: boolean;
    }
  | {
      ok: false;
    };

/** Join a group through a link. Every failure is the same `{ ok: false }`. */
export async function joinByInvite(userId: string, code: string): Promise<JoinResult> {
  if (!isInviteCode(code))
    return {
      ok: false,
    };
  const found = await prisma.chatInvite.findUnique({
    where: {
      code,
    },
    select: {
      chatId: true,
    },
  });
  if (!found)
    return {
      ok: false,
    };
  const chatId = found.chatId;

  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group)
      return {
        ok: false,
      } as const;
    // Re-read under the lock: what the first read saw may have changed since.
    const invite = await tx.chatInvite.findUnique({
      where: {
        code,
      },
      select: {
        ...SELECT,
        chatId: true,
        createdById: true,
      },
    });
    if (!invite || invite.chatId !== chatId)
      return {
        ok: false,
      } as const;
    const members = await tx.chatMember.findMany({
      where: {
        chatId,
      },
      select: {
        userId: true,
      },
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.includes(userId))
      return {
        ok: true,
        chatId,
        alreadyMember: true,
      } as const;
    const now = new Date();
    if (!isInviteLive(invite, now))
      return {
        ok: false,
      } as const;
    if (!(await mayJoin(tx, chatId, invite.createdById, userId, memberIds)))
      return {
        ok: false,
      } as const;
    // Compare-and-set: the use is counted only if the link is still live as it was read.
    const claimed = await tx.chatInvite.updateMany({
      where: {
        id: invite.id,
        revokedAt: null,
        uses: invite.uses,
        ...(invite.maxUses !== null
          ? {
              uses: {
                lt: invite.maxUses,
                equals: invite.uses,
              },
            }
          : {}),
        OR: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              gt: now,
            },
          },
        ],
      },
      data: {
        uses: {
          increment: 1,
        },
      },
    });
    if (claimed.count !== 1)
      return {
        ok: false,
      } as const;
    await tx.chatMember.create({
      data: {
        chatId,
        userId,
        joinedViaInviteId: invite.id,
      },
    });
    const joiner = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: userDisplaySelect,
    });
    return {
      ok: true,
      chatId,
      alreadyMember: false,
      creatorId: invite.createdById,
      joinerName: displayName(joiner),
    } as const;
  });
  if (!done.ok)
    return {
      ok: false,
    };
  if (!done.alreadyMember) {
    // The same line `addMembers` posts, spoken by the new member (the link's creator may have left).
    await announce(chatId, userId, {
      line: {
        action: 'add',
        actorId: done.creatorId,
        targetId: userId,
        targetName: done.joinerName,
      },
      update: {
        kind: 'group',
        chatId,
        op: 'group',
        change: 'members',
      },
    });
  }
  return {
    ok: true,
    chatId,
    alreadyMember: done.alreadyMember,
  };
}

export type InvitePreview =
  | {
      state: 'invalid';
    }
  | {
      state: 'signed-out';
      name: string;
    }
  | {
      state: 'member';
      chatId: string;
    }
  | {
      state: 'valid';
      name: string;
      memberCount: number;
      memberNames: string[];
    };

/**
 * What the join page shows. An invalid code (unknown, revoked, expired, used up, or one this viewer may not use)
 * returns nothing about the group. Never the message history.
 */
export async function previewInvite(code: string, viewerId: string | null): Promise<InvitePreview> {
  if (!isInviteCode(code))
    return {
      state: 'invalid',
    };
  const invite = await prisma.chatInvite.findUnique({
    where: {
      code,
    },
    select: {
      ...SELECT,
      createdById: true,
      chat: {
        select: {
          id: true,
          name: true,
          kind: true,
          members: {
            orderBy: {
              joinedAt: 'asc',
            },
            select: {
              userId: true,
              user: {
                select: userDisplaySelect,
              },
            },
          },
        },
      },
    },
  });
  if (!invite || invite.chat.kind !== 'group')
    return {
      state: 'invalid',
    };
  const memberIds = invite.chat.members.map((m) => m.userId);
  if (viewerId && memberIds.includes(viewerId))
    return {
      state: 'member',
      chatId: invite.chat.id,
    };
  if (!isInviteLive(invite, new Date()))
    return {
      state: 'invalid',
    };
  const name = invite.chat.name ?? '';
  if (!viewerId)
    return {
      state: 'signed-out',
      name,
    };
  if (!(await mayJoin(prisma, invite.chat.id, invite.createdById, viewerId, memberIds))) {
    return {
      state: 'invalid',
    };
  }
  // Profile privacy: the joiner is a stranger to the group, so a name is shown only to a viewer the member's own
  // follow-list setting would show it to (`canSeeFollowLists`, the rule that governs who may browse who a user is
  // connected to); members with a private or mutuals-only profile are counted, never named.
  const candidates = invite.chat.members.filter((m) => m.userId !== DELETED_USER_ID).slice(0, 15);
  const shown = await Promise.all(candidates.map((m) => canSeeFollowLists(viewerId, m.userId)));
  const memberNames = candidates
    .filter((_m, i) => shown[i])
    .map((m) => displayName(m.user))
    .filter((n): n is string => !!n)
    .slice(0, 5);
  return {
    state: 'valid',
    name,
    memberCount: memberIds.length,
    memberNames,
  };
}

/** Account erasure: the links the member made and the removals on record about them. Prisma operations only. */
export function groupInviteErasureOps(userId: string) {
  return [
    prisma.chatInvite.deleteMany({
      where: {
        createdById: userId,
      },
    }),
    prisma.chatRemoval.deleteMany({
      where: {
        userId,
      },
    }),
  ];
}

/** Account export: the links the member created. */
export async function exportGroupInvites(userId: string) {
  const rows = await prisma.chatInvite.findMany({
    where: {
      createdById: userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      createdAt: true,
      uses: true,
      chat: {
        select: {
          name: true,
        },
      },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    groupName: r.chat.name,
    createdAt: r.createdAt.toISOString(),
    uses: r.uses,
  }));
}

/** The page's preview, rate-limited per IP (20 a minute) so the page cannot be used to probe codes. */
export async function previewInviteForRequest(
  request: Request,
  code: string,
  viewerId: string | null,
): Promise<InvitePreview> {
  const { allowed } = await checkRateLimit(getClientIp(request), {
    limit: 20,
    windowMs: 60_000,
    prefix: 'group-invite-join',
  });
  if (!allowed)
    return {
      state: 'invalid',
    };
  return previewInvite(code, viewerId);
}
