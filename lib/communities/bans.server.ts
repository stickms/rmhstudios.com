/**
 * Community bans and timeouts (s06-01, server-only): the one reader every
 * enforcement path calls (`activeSanction`), create/replace/lift in one
 * transaction each, the moderators' lists, erasure and export.
 *
 * Time: "active" is judged against the application clock (`endsAt > now`), the
 * same clock every other community check uses; expiry is read-time, no job.
 */
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { userChipSelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { markRemoved } from '@/lib/communities/join-requests.server';
import { activeWhere, activeSanction, asKind } from '@/lib/communities/sanction-read.server';
import { recordMemberEvent } from '@/lib/communities/member-events.server';
import { getRule } from '@/lib/communities/rules.server';
import {
  PAST_SANCTIONS_LIMIT,
  endsAtFor,
  liftedNotice,
  sanctionNotice,
  type SanctionDTO,
  type SanctionDuration,
  type SanctionKind,
} from '@/lib/communities/bans';
import { withVia, type ModVia } from '@/lib/communities/modlog';
import type { CommunityRole } from '@/lib/communities/access.server';

export { activeSanction, type ActiveSanction } from '@/lib/communities/sanction-read.server';

export type SanctionResult =
  | {
      ok: true;
      id: string;
      endsAt: Date | null;
    }
  | {
      ok: false;
      status: 400 | 403 | 404;
      error: string;
    };

export interface SanctionInput {
  community: {
    id: string;
    name: string;
    createdById: string;
  };
  actorId: string;
  actorRole: CommunityRole | null;
  targetUserId: string;
  kind: SanctionKind;
  duration: SanctionDuration;
  ruleId?: string | undefined;
  reason?: string | undefined;
  /** s10-13: `'api'` when a developer-API key made the call; recorded in the moderators' log detail only. */
  via?: ModVia | undefined;
}

/**
 * Ban or time out a member. Mods act on members only; the owner acts on mods; the
 * creator and yourself are off limits. The previous active sanction is marked lifted
 * before the new row is inserted, all under one advisory lock per member.
 */
export async function sanction(input: SanctionInput): Promise<SanctionResult> {
  const { community, actorId, targetUserId } = input;
  if (input.actorRole !== 'MOD' && input.actorRole !== 'ADMIN') {
    return {
      ok: false,
      status: 403,
      ...refusalBody('COMMUNITY_MODS_ONLY'),
    };
  }
  if (targetUserId === actorId) {
    return {
      ok: false,
      status: 400,
      ...refusalBody('COMMUNITY_SANCTION_SELF'),
    };
  }
  if (targetUserId === community.createdById) {
    return {
      ok: false,
      status: 400,
      ...refusalBody('COMMUNITY_OWNER_PROTECTED'),
    };
  }
  const target = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId: community.id,
        userId: targetUserId,
      },
    },
    select: {
      id: true,
      role: true,
    },
  });
  if (target?.role === 'ADMIN') {
    return {
      ok: false,
      status: 400,
      ...refusalBody('COMMUNITY_OWNER_PROTECTED'),
    };
  }
  if (target?.role === 'MOD' && input.actorRole !== 'ADMIN') {
    return {
      ok: false,
      status: 403,
      ...refusalBody('COMMUNITY_MOD_SANCTION_OWNER_ONLY'),
    };
  }
  if (!target && input.kind === 'timeout') {
    return {
      ok: false,
      status: 404,
      ...refusalBody('COMMUNITY_NOT_A_MEMBER'),
    };
  }
  if (!target) {
    const exists = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
      },
    });
    if (!exists)
      return {
        ok: false,
        status: 404,
        ...refusalBody('COMMUNITY_MEMBER_NOT_FOUND'),
      };
  }
  const rule = input.ruleId ? await getRule(community.id, input.ruleId) : null;
  if (input.ruleId && !rule)
    return {
      ok: false,
      status: 400,
      ...refusalBody('COMMUNITY_RULE_NOT_FOUND'),
    };

  const now = new Date();
  const endsAt = endsAtFor(input.duration, now);
  const reason = input.reason?.trim() || null;

  const id = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `community-ban:${community.id}:${targetUserId}`);
    // At most one active sanction per member: the old one is lifted first.
    await tx.communityBan.updateMany({
      where: {
        communityId: community.id,
        userId: targetUserId,
        liftedAt: null,
      },
      data: {
        liftedAt: now,
        liftedById: actorId,
      },
    });
    const row = await tx.communityBan.create({
      data: {
        communityId: community.id,
        userId: targetUserId,
        kind: input.kind,
        endsAt,
        ruleId: rule?.id ?? null,
        reason,
        createdById: actorId,
      },
      select: {
        id: true,
      },
    });
    if (input.kind === 'ban' && target) {
      // The removal path's bookkeeping, in the same transaction.
      await tx.communityMember.delete({
        where: {
          id: target.id,
        },
      });
      await tx.community.update({
        where: {
          id: community.id,
        },
        data: {
          memberCount: {
            decrement: 1,
          },
        },
      });
      await markRemoved(tx, community.id, targetUserId, actorId);
      await recordMemberEvent(tx, community.id, targetUserId, 'removed');
    }
    await logModAction(tx, {
      communityId: community.id,
      actorId,
      action: input.kind === 'ban' ? 'member_banned' : 'member_timed_out',
      targetUserId,
      targetType: 'member',
      targetId: row.id,
      ruleId: rule?.id ?? null,
      ruleTitle: rule?.title ?? null,
      reason,
      detail: withVia({ duration: input.duration }, input.via),
    });
    return row.id;
  });

  // The member is told the kind, the end and the rule's title; never the private reason.
  await createNotification({
    userId: targetUserId,
    type: 'SYSTEM',
    entityType: 'community_ban',
    entityId: community.id,
    preview: sanctionNotice({
      communityName: community.name,
      kind: input.kind,
      endsAt,
      ruleTitle: rule?.title ?? null,
    }),
  });
  return {
    ok: true,
    id,
    endsAt,
  };
}

export type LiftResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 404;
      error: string;
    };

/** Lift a still-active sanction early. Takes effect at once and tells the member. */
export async function lift(args: {
  community: {
    id: string;
    name: string;
  };
  banId: string;
  actorId: string;
  via?: ModVia | undefined;
}): Promise<LiftResult> {
  const now = new Date();
  const row = await prisma.communityBan.findFirst({
    where: {
      id: args.banId,
      communityId: args.community.id,
      ...activeWhere(now),
    },
    select: {
      id: true,
      userId: true,
      kind: true,
    },
  });
  if (!row)
    return {
      ok: false,
      status: 404,
      error: 'Not found',
    };
  const done = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `community-ban:${args.community.id}:${row.userId}`);
    // Compare-and-set: a concurrent lift or replace already closed it.
    const res = await tx.communityBan.updateMany({
      where: {
        id: row.id,
        liftedAt: null,
      },
      data: {
        liftedAt: now,
        liftedById: args.actorId,
      },
    });
    if (res.count === 0) return false;
    await logModAction(tx, {
      communityId: args.community.id,
      actorId: args.actorId,
      action: 'ban_lifted',
      targetUserId: row.userId,
      targetType: 'member',
      targetId: row.id,
      detail: withVia({ kind: row.kind }, args.via),
    });
    return true;
  });
  if (!done)
    return {
      ok: false,
      status: 404,
      error: 'Not found',
    };
  await createNotification({
    userId: row.userId,
    type: 'SYSTEM',
    entityType: 'community_ban',
    entityId: args.community.id,
    preview: liftedNotice({
      communityName: args.community.name,
      kind: asKind(row.kind),
    }),
  });
  return {
    ok: true,
  };
}

/** Active sanctions, or (`past`) the last 100 lifted or expired. Moderators only; carries the private reason. */
export async function listSanctions(
  communityId: string,
  status: 'active' | 'past',
  now: Date = new Date(),
): Promise<SanctionDTO[]> {
  const rows = await prisma.communityBan.findMany({
    where:
      status === 'active'
        ? {
            communityId,
            ...activeWhere(now),
          }
        : {
            communityId,
            OR: [
              {
                liftedAt: {
                  not: null,
                },
              },
              {
                endsAt: {
                  lte: now,
                },
              },
            ],
          },
    orderBy: {
      createdAt: 'desc',
    },
    take: status === 'active' ? 200 : PAST_SANCTIONS_LIMIT,
    select: {
      id: true,
      kind: true,
      endsAt: true,
      createdAt: true,
      liftedAt: true,
      reason: true,
      ruleId: true,
      createdById: true,
      user: {
        select: userChipSelect,
      },
    },
  });
  const ruleIds = [...new Set(rows.map((r) => r.ruleId).filter((v): v is string => !!v))];
  const modIds = [...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))];
  const [rules, mods] = await Promise.all([
    ruleIds.length
      ? prisma.communityRule.findMany({
          where: {
            communityId,
            id: {
              in: ruleIds,
            },
          },
          select: {
            id: true,
            title: true,
          },
        })
      : Promise.resolve([]),
    modIds.length
      ? prisma.user.findMany({
          where: {
            id: {
              in: modIds,
            },
          },
          select: userChipSelect,
        })
      : Promise.resolve([]),
  ]);
  const ruleTitle = new Map(rules.map((r) => [r.id, r.title]));
  const modById = new Map(mods.map((m) => [m.id, m]));
  return rows.map((r) => ({
    id: r.id,
    kind: asKind(r.kind),
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    liftedAt: r.liftedAt ? r.liftedAt.toISOString() : null,
    reason: r.reason,
    ruleTitle: r.ruleId ? (ruleTitle.get(r.ruleId) ?? null) : null,
    member: r.user
      ? {
          id: r.user.id,
          name: r.user.name,
          handle: r.user.handle,
        }
      : null,
    moderator: r.createdById
      ? (() => {
          const m = modById.get(r.createdById);
          return m
            ? {
                id: m.id,
                name: m.name,
                handle: m.handle,
              }
            : null;
        })()
      : null,
  }));
}

/**
 * Account erasure: sanctions about the member are deleted; where the member was the
 * moderator, the reference is nulled. Prisma operations only, for the erasure
 * `$transaction([...])`.
 */
export function communityBanErasureOps(userId: string) {
  return [
    prisma.communityBan.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.communityBan.updateMany({
      where: {
        createdById: userId,
      },
      data: {
        createdById: null,
      },
    }),
    prisma.communityBan.updateMany({
      where: {
        liftedById: userId,
      },
      data: {
        liftedById: null,
      },
    }),
  ];
}

/** The member's own export: sanctions about them, without the private reason or who set it. */
export async function exportCommunitySanctions(userId: string) {
  const rows = await prisma.communityBan.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      kind: true,
      endsAt: true,
      createdAt: true,
      liftedAt: true,
      community: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    community: r.community.slug,
    communityName: r.community.name,
    kind: r.kind,
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    liftedAt: r.liftedAt ? r.liftedAt.toISOString() : null,
  }));
}
