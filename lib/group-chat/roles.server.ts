/**
 * Group chat admins (s07-04). Server-only.
 *
 * Making and unmaking an admin is owner-only and runs in one transaction under the group's lock (`lockedGroup`): the
 * owner check, the target's membership and the 5-admin cap are all read while the lock is held, so a promotion racing
 * a removal, a leave or another promotion cannot overshoot the cap or promote someone who is already gone. Demoting an
 * admin revokes the live invite links they made in the same transaction. The system line goes out after the commit,
 * best-effort, like every other management line.
 */

import { refusalBody, refusalBeside } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { announce, displayName, lockedGroup, refuseUnlessManager } from '@/lib/group-chat/manage.server';
import { revokeInvitesOf } from '@/lib/group-chat/invites-revoke.server';
import { adminSeatLeft, MAX_GROUP_ADMINS } from '@/lib/group-chat/roles';
import { userDisplaySelect } from '@/lib/user-display';

export type SetAdminResult =
  | {
      ok: true;
      admin: boolean;
      changed: boolean;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409;
      error: string;
      code?: 'ADMIN_LIMIT';
    };

/** Owner only: make `targetId` an admin of the group (`admin` true) or an ordinary member again (false). Idempotent. */
export async function setAdmin(
  chatId: string,
  actorId: string,
  targetId: string,
  admin: boolean,
): Promise<SetAdminResult> {
  const done = await prisma.$transaction(async (tx) => {
    const group = await lockedGroup(tx, chatId);
    if (!group)
      return {
        ok: false,
        status: 404,
        error: 'Not found',
      } as const;
    // Owner standing only: an admin cannot set any role, their own included.
    const refusal = await refuseUnlessManager(tx, group, actorId, 'owner');
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
    if (!target)
      return {
        ok: false,
        status: 404,
        error: 'Not found',
      } as const;
    // The owner sits above every admin and is never an admin row.
    if (group.ownerId === targetId)
      return {
        ok: false,
        status: 400,
        ...refusalBody('GROUP_OWNER_ABOVE_ADMINS'),
      } as const;
    const isAdmin = target.role === 'admin';
    const targetName = displayName(target.user);
    if (isAdmin === admin)
      return {
        ok: true,
        changed: false,
        targetName,
        revoked: 0,
      } as const;
    if (admin) {
      const count = await tx.chatMember.count({
        where: {
          chatId,
          role: 'admin',
        },
      });
      if (!adminSeatLeft(count))
        return {
          ok: false,
          status: 409,
          ...refusalBeside('GROUP_ADMIN_LIMIT', { max: MAX_GROUP_ADMINS }),
          code: 'ADMIN_LIMIT',
        } as const;
    }
    await tx.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId: targetId,
        },
      },
      data: {
        role: admin ? 'admin' : 'member',
      },
    });
    // A demoted admin cannot keep a door open: their live links are revoked with the role.
    const revoked = admin ? 0 : await revokeInvitesOf(tx, chatId, targetId);
    return {
      ok: true,
      changed: true,
      targetName,
      revoked,
    } as const;
  });
  if (!done.ok) return done as SetAdminResult;
  if (done.changed)
    await announce(chatId, actorId, {
      line: admin
        ? {
            action: 'admin-added',
            actorId,
            targetId,
            targetName: done.targetName,
          }
        : {
            action: 'admin-removed',
            actorId,
            targetId,
            targetName: done.targetName,
            ...(done.revoked > 0
              ? {
                  revokedLinks: done.revoked,
                }
              : {}),
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
    admin,
    changed: done.changed,
  };
}
