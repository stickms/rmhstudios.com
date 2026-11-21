/**
 * The read side of community sanctions (s06-01, server-only): the active-sanction
 * lookup every enforcement path calls. A leaf module: bans.server and
 * join-requests.server both need it and import each other's writes, so it
 * imports neither.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { type SanctionKind } from '@/lib/communities/bans';

export interface ActiveSanction {
  id: string;
  kind: SanctionKind;
  endsAt: Date | null;
  ruleId:
    | string
    | null;
}

export const asKind =
  (
    v: string,
  ): SanctionKind =>
    v ===
    'ban'
      ? 'ban'
      : 'timeout';

/** `where` for "not lifted and not ended yet". */
export const activeWhere =
  (
    now: Date,
  ): Prisma.CommunityBanWhereInput => ({
    liftedAt:
      null,
    OR: [
      {
        endsAt:
          null,
      },
      {
        endsAt:
          {
            gt: now,
          },
      },
    ],
  });

/**
 * The member's active ban or timeout in a community, or `null`. One indexed lookup
 * (`communityId, userId, liftedAt`). Never returns the private reason.
 */
export async function activeSanction(
  communityId: string,
  userId: string,
  now: Date = new Date(),
): Promise<ActiveSanction | null> {
  const row =
    await prisma.communityBan.findFirst(
      {
        where:
          {
            communityId,
            userId,
            ...activeWhere(
              now,
            ),
          },
        orderBy:
          {
            createdAt:
              'desc',
          },
        select:
          {
            id: true,
            kind: true,
            endsAt: true,
            ruleId: true,
          },
      },
    );
  return row
    ? {
        ...row,
        kind: asKind(
          row.kind,
        ),
      }
    : null;
}
