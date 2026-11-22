/**
 * Issuing a strike — the one implementation. The admin strike endpoint and the
 * content-moderation endpoint both call `issueStrike`, so the three-strike
 * auto-ban (and its "only ever extends, never touches a tombstone" rule) is
 * written once.
 */

import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { dropLearnerBoardCaches } from '@/lib/rmhmusic/learn/social/board-cache.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import {
  AUTO_BAN_DURATION_MS,
  AUTO_BAN_REASON,
  AUTO_BAN_THRESHOLD,
  activeStrikeWhere,
} from '@/lib/moderation/standing.server';

export interface IssueStrikeInput {
  userId: string;
  adminId: string;
  reason: string;
  expiresDays?: number | undefined;
  entityType?: string | null | undefined;
  entityId?: string | null | undefined;
  /**
   * The notification text. Defaults to the plain warning; the content
   * moderation flow sends one notice for the removal and the strike together,
   * so it passes `notify: false` and writes its own.
   */
  notify?: boolean;
}

export interface IssueStrikeResult {
  strikeId: string;
  activeStrikes: number;
  autoBanned: boolean;
}

export async function issueStrike(input: IssueStrikeInput): Promise<IssueStrikeResult> {
  const strike = await prisma.userStrike.create({
    data: {
      userId: input.userId,
      adminId: input.adminId,
      reason: input.reason,
      expiresAt: input.expiresDays ? new Date(Date.now() + input.expiresDays * 24 * 60 * 60 * 1000) : null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
    select: {
      id: true,
    },
  });
  await logAdminAction(input.adminId, 'user.strike', {
    targetType: 'user',
    targetId: input.userId,
    detail: input.reason,
  });

  // Auto-ban on the 3rd active strike.
  const activeStrikes = await prisma.userStrike.count({
    where: activeStrikeWhere(input.userId),
  });
  let autoBanned = false;
  if (activeStrikes >= AUTO_BAN_THRESHOLD) {
    const until = new Date(Date.now() + AUTO_BAN_DURATION_MS);
    // Conditional: the auto-ban only ever extends. A longer (manual or
    // permanent) ban is never shortened to 7 days, and a deletion
    // tombstone is never overwritten.
    const banned = await prisma.user.updateMany({
      where: {
        id: input.userId,
        AND: [
          {
            OR: [
              {
                bannedUntil: null,
              },
              {
                bannedUntil: {
                  lt: until,
                },
              },
            ],
          },
          {
            OR: [
              {
                banReason: null,
              },
              {
                banReason: {
                  not: DELETED_ACCOUNT_BAN_REASON,
                },
              },
            ],
          },
        ],
      },
      data: {
        bannedUntil: until,
        banReason: AUTO_BAN_REASON,
      },
    });
    if (banned.count > 0) {
      await prisma.session
        .deleteMany({
          where: {
            userId: input.userId,
          },
        })
        .catch(() => {});
      await dropLearnerBoardCaches(input.userId, Date.now());
      await logAdminAction(input.adminId, 'user.autoban', {
        targetType: 'user',
        targetId: input.userId,
        detail: `${AUTO_BAN_THRESHOLD} strikes`,
      });
      autoBanned = true;
    }
  }

  if (input.notify !== false) {
    // Point the notification at the strike so the user lands on their
    // account-status page, where they can read the record and appeal it.
    await createNotification({
      userId: input.userId,
      type: 'SYSTEM',
      entityType: 'strike',
      entityId: strike.id,
      link: '/settings/account-status',
      preview: notice('strike-warning', { reason: input.reason }),
    });
  }

  return {
    strikeId: strike.id,
    activeStrikes,
    autoBanned,
  };
}

/**
 * After a strike stops counting (an appeal overturned it, or a sweep was undone), recount the active strikes
 * and lift the auto-ban if it no longer applies. Deliberately narrow: only a ban carrying exactly
 * `AUTO_BAN_REASON` is cleared, never a manual ban an admin issued for separate reasons. Shared by the appeal
 * decision (`admin.appeals.$id.server.ts`) and the spam-sweep undo, so the rule is written once.
 */
export async function liftAutoBanIfNoLongerApplies(userId: string): Promise<boolean> {
  const remaining = await prisma.userStrike.count({
    where: activeStrikeWhere(userId),
  });
  if (remaining >= AUTO_BAN_THRESHOLD) return false;
  const lifted = await prisma.user.updateMany({
    where: {
      id: userId,
      banReason: AUTO_BAN_REASON,
      bannedUntil: {
        gt: new Date(),
      },
    },
    data: {
      bannedUntil: null,
      banReason: null,
    },
  });
  if (lifted.count === 0) return false;
  await dropLearnerBoardCaches(userId, Date.now());
  return true;
}

/**
 * Void a strike the way an overturned appeal does (there is no strike-withdraw function): `appealStatus`
 * becomes OVERTURNED, which `activeStrikeWhere` excludes, then the auto-ban is lifted if it no longer applies.
 * Compare-and-set, so a strike already overturned is left alone. Returns whether this call voided it.
 */
export async function overturnStrike(input: {
  strikeId: string;
  adminId: string;
  note: string;
}): Promise<{ overturned: boolean; banLifted: boolean }> {
  const strike = await prisma.userStrike.findUnique({
    where: {
      id: input.strikeId,
    },
    select: {
      userId: true,
    },
  });
  if (!strike)
    return {
      overturned: false,
      banLifted: false,
    };
  const { count } = await prisma.userStrike.updateMany({
    where: {
      id: input.strikeId,
      appealStatus: {
        not: 'OVERTURNED',
      },
    },
    data: {
      appealStatus: 'OVERTURNED',
      appealNote: input.note.slice(0, 1000),
      appealAdminId: input.adminId,
      decidedAt: new Date(),
    },
  });
  if (count === 0)
    return {
      overturned: false,
      banLifted: false,
    };
  const banLifted = await liftAutoBanIfNoLongerApplies(strike.userId);
  return {
    overturned: true,
    banLifted,
  };
}
