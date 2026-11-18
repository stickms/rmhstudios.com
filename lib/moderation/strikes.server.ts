/**
 * Issuing a strike — the one implementation. The admin strike endpoint and the
 * content-moderation endpoint both call `issueStrike`, so the three-strike
 * auto-ban (and its "only ever extends, never touches a tombstone" rule) is
 * written once.
 */

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
  expiresDays?:
    | number
    | undefined;
  entityType?:
    | string
    | null
    | undefined;
  entityId?:
    | string
    | null
    | undefined;
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

export async function issueStrike(
  input: IssueStrikeInput,
): Promise<IssueStrikeResult> {
  const strike =
    await prisma.userStrike.create(
      {
        data: {
          userId:
            input.userId,
          adminId:
            input.adminId,
          reason:
            input.reason,
          expiresAt:
            input.expiresDays
              ? new Date(
                  Date.now() +
                    input.expiresDays *
                      24 *
                      60 *
                      60 *
                      1000,
                )
              : null,
          entityType:
            input.entityType ??
            null,
          entityId:
            input.entityId ??
            null,
        },
        select:
          {
            id: true,
          },
      },
    );
  await logAdminAction(
    input.adminId,
    'user.strike',
    {
      targetType:
        'user',
      targetId:
        input.userId,
      detail:
        input.reason,
    },
  );

  // Auto-ban on the 3rd active strike.
  const activeStrikes =
    await prisma.userStrike.count(
      {
        where:
          activeStrikeWhere(
            input.userId,
          ),
      },
    );
  let autoBanned = false;
  if (
    activeStrikes >=
    AUTO_BAN_THRESHOLD
  ) {
    const until =
      new Date(
        Date.now() +
          AUTO_BAN_DURATION_MS,
      );
    // Conditional: the auto-ban only ever extends. A longer (manual or
    // permanent) ban is never shortened to 7 days, and a deletion
    // tombstone is never overwritten.
    const banned =
      await prisma.user.updateMany(
        {
          where:
            {
              id: input.userId,
              AND: [
                {
                  OR: [
                    {
                      bannedUntil:
                        null,
                    },
                    {
                      bannedUntil:
                        {
                          lt: until,
                        },
                    },
                  ],
                },
                {
                  OR: [
                    {
                      banReason:
                        null,
                    },
                    {
                      banReason:
                        {
                          not: DELETED_ACCOUNT_BAN_REASON,
                        },
                    },
                  ],
                },
              ],
            },
          data: {
            bannedUntil:
              until,
            banReason:
              AUTO_BAN_REASON,
          },
        },
      );
    if (
      banned.count >
      0
    ) {
      await prisma.session
        .deleteMany(
          {
            where:
              {
                userId:
                  input.userId,
              },
          },
        )
        .catch(
          () => {},
        );
      await dropLearnerBoardCaches(
        input.userId,
        Date.now(),
      );
      await logAdminAction(
        input.adminId,
        'user.autoban',
        {
          targetType:
            'user',
          targetId:
            input.userId,
          detail: `${AUTO_BAN_THRESHOLD} strikes`,
        },
      );
      autoBanned = true;
    }
  }

  if (
    input.notify !==
    false
  ) {
    // Point the notification at the strike so the user lands on their
    // account-status page, where they can read the record and appeal it.
    await createNotification(
      {
        userId:
          input.userId,
        type: 'SYSTEM',
        entityType:
          'strike',
        entityId:
          strike.id,
        link: '/settings/account-status',
        preview: `You received a moderation warning: ${input.reason}. You can review or appeal it in Settings → Account status.`,
      },
    );
  }

  return {
    strikeId:
      strike.id,
    activeStrikes,
    autoBanned,
  };
}
