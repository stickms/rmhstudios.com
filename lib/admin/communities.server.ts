/**
 * Community oversight for admins (sprint 10 17) — server logic. Server only: never import from a component.
 *
 * The list is one page of 50 communities with figures from grouped queries (one per figure, never one per row): posts
 * this week, open reports on the community's posts, open mod-queue items, the last moderator action and joins this
 * week against the week before. A filter that depends on a figure first finds the matching community ids with one
 * grouped query over all communities, then pages those.
 *
 * Taking a community out of discovery sets `delistedAt`, `delistedReason` and `delistedById` and writes the audit row
 * in the same transaction (taken under an advisory lock, and written with a compare-and-set so two admins cannot both
 * succeed). Its moderators get one notice afterwards. Members, the page and the feed are not touched; there is no
 * freeze, archive or deletion here.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { invalidateCached } from '@/lib/cached.server';
import { notice } from '@/lib/notifications/notice-keys';
import { userChipSelect } from '@/lib/user-display';
import { DISCOVERY_CACHE_KEYS } from '@/lib/communities/discovery';
import {
  COMMUNITIES_PAGE_SIZE,
  COMMUNITY_DETAIL_LOG_SIZE,
  COMMUNITY_DETAIL_REPORT_SIZE,
  COMMUNITY_WINDOW_MS,
  GROWING_FACTOR,
  GROWING_MIN_JOINS,
  OPEN_REPORT_STATUSES,
  QUIET_MODERATOR_MS,
  decodeCommunityCursor,
  encodeCommunityCursor,
  isGrowingFast,
  isModeratorQuiet,
  type AdminCommunityDetail,
  type AdminCommunityList,
  type AdminCommunityRow,
  type CommunityAdminRefusal,
  type CommunityFilter,
} from '@/lib/admin/communities';

/** A refusal the route turns into its HTTP status and `reason`. */
export class CommunityAdminRefused extends Error {
  constructor(public readonly reason: CommunityAdminRefusal) {
    super(reason);
  }
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const COMMUNITY_SELECT = {
  id: true,
  slug: true,
  name: true,
  isPrivate: true,
  memberCount: true,
  delistedAt: true,
  delistedReason: true,
} as const;

type CommunityCore = Prisma.CommunityGetPayload<{ select: typeof COMMUNITY_SELECT }>;

/**
 * The communities with an open report on one of their posts: report -> post -> community. Grouped in the database.
 * Table and column names are the schema's (`content_report`, `rmheet`; `"entityType"`, `"entityId"`, `"communityId"`).
 */
export function openReportCountsSql(communityIds: string[] | null): Prisma.Sql {
  const only = communityIds ? Prisma.sql`AND r."communityId" = ANY(${communityIds}::text[])` : Prisma.empty;
  return Prisma.sql`
    SELECT r."communityId" AS "communityId", COUNT(*)::int AS n
    FROM content_report cr
    JOIN rmheet r ON r.id = cr."entityId"
    WHERE cr."entityType" = 'rmhark'
      AND cr.status::text IN (${Prisma.join([...OPEN_REPORT_STATUSES])})
      AND r."communityId" IS NOT NULL
      ${only}
    GROUP BY r."communityId"`;
}

/** Joins this week against the week before, for every community with enough joins this week to be "growing". */
export function growingCandidatesSql(now: Date): Prisma.Sql {
  const weekAgo = new Date(now.getTime() - COMMUNITY_WINDOW_MS);
  const twoWeeksAgo = new Date(now.getTime() - 2 * COMMUNITY_WINDOW_MS);
  return Prisma.sql`
    SELECT "communityId" AS "communityId",
           (COUNT(*) FILTER (WHERE "createdAt" >= ${weekAgo}))::int AS cur,
           (COUNT(*) FILTER (WHERE "createdAt" < ${weekAgo}))::int AS prev
    FROM community_member_event
    WHERE kind = 'join' AND "createdAt" >= ${twoWeeksAgo}
    GROUP BY "communityId"
    HAVING COUNT(*) FILTER (WHERE "createdAt" >= ${weekAgo}) >= ${GROWING_MIN_JOINS}`;
}

async function whereForFilter(filter: CommunityFilter, now: Date): Promise<Prisma.CommunityWhereInput> {
  switch (filter) {
    case 'delisted':
      return { delistedAt: { not: null } };
    case 'quiet':
      return {
        modActions: {
          none: { actorId: { not: null }, createdAt: { gte: new Date(now.getTime() - QUIET_MODERATOR_MS) } },
        },
      };
    case 'reports': {
      const rows = await prisma.$queryRaw<{ communityId: string }[]>(openReportCountsSql(null));
      return { id: { in: (rows ?? []).map((r) => r.communityId) } };
    }
    case 'growing': {
      const rows = await prisma.$queryRaw<{ communityId: string; cur: number; prev: number }[]>(
        growingCandidatesSql(now),
      );
      const ids = (rows ?? []).filter((r) => r.cur >= GROWING_FACTOR * r.prev).map((r) => r.communityId);
      return { id: { in: ids } };
    }
    default:
      return {};
  }
}

/** Figures for a set of communities: one grouped query each, whatever the page size. */
async function figuresFor(ids: string[], now: Date) {
  const weekAgo = new Date(now.getTime() - COMMUNITY_WINDOW_MS);
  const twoWeeksAgo = new Date(now.getTime() - 2 * COMMUNITY_WINDOW_MS);
  const [posts, reports, queue, lastAction, joinsNow, joinsPrev] = await Promise.all([
    prisma.rMHark.groupBy({
      by: ['communityId'],
      where: { communityId: { in: ids }, deletedAt: null, createdAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ communityId: string; n: number }[]>(openReportCountsSql(ids)),
    prisma.communityModItem.groupBy({
      by: ['communityId'],
      where: { communityId: { in: ids }, status: 'PENDING' },
      _count: { _all: true },
    }),
    prisma.communityModAction.groupBy({
      by: ['communityId'],
      where: { communityId: { in: ids }, actorId: { not: null } },
      _max: { createdAt: true },
    }),
    prisma.communityMemberEvent.groupBy({
      by: ['communityId'],
      where: { communityId: { in: ids }, kind: 'join', createdAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.communityMemberEvent.groupBy({
      by: ['communityId'],
      where: { communityId: { in: ids }, kind: 'join', createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      _count: { _all: true },
    }),
  ]);
  const countOf = (rows: { communityId: string | null; _count: { _all: number } }[] | undefined) =>
    new Map((rows ?? []).map((r) => [r.communityId ?? '', r._count._all]));
  return {
    posts: countOf(posts),
    reports: new Map((reports ?? []).map((r) => [r.communityId, Number(r.n)])),
    queue: countOf(queue),
    lastAction: new Map((lastAction ?? []).map((r) => [r.communityId, r._max.createdAt ?? null])),
    joinsNow: countOf(joinsNow),
    joinsPrev: countOf(joinsPrev),
  };
}

type Figures = Awaited<ReturnType<typeof figuresFor>>;

function toRow(c: CommunityCore, f: Figures, now: Date): AdminCommunityRow {
  const last = f.lastAction.get(c.id) ?? null;
  const joinsThisWeek = f.joinsNow.get(c.id) ?? 0;
  const joinsPreviousWeek = f.joinsPrev.get(c.id) ?? 0;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    isPrivate: c.isPrivate,
    memberCount: c.memberCount,
    postsThisWeek: f.posts.get(c.id) ?? 0,
    openReports: f.reports.get(c.id) ?? 0,
    openModItems: f.queue.get(c.id) ?? 0,
    lastModActionAt: iso(last),
    joinsThisWeek,
    joinsPreviousWeek,
    growingFast: isGrowingFast(joinsThisWeek, joinsPreviousWeek),
    quiet: isModeratorQuiet(last, now),
    delistedAt: iso(c.delistedAt),
    delistedReason: c.delistedReason,
  };
}

export async function listAdminCommunities(
  opts: { filter: CommunityFilter; q?: string | undefined; cursor?: string | undefined },
  now: Date = new Date(),
): Promise<AdminCommunityList> {
  const and: Prisma.CommunityWhereInput[] = [await whereForFilter(opts.filter, now)];
  const q = opts.q?.trim();
  if (q) {
    and.push({
      OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }],
    });
  }
  const cursor = opts.cursor ? decodeCommunityCursor(opts.cursor) : null;
  if (cursor) {
    and.push({
      OR: [{ memberCount: { lt: cursor.memberCount } }, { memberCount: cursor.memberCount, id: { lt: cursor.id } }],
    });
  }
  const rows = await prisma.community.findMany({
    where: { AND: and },
    orderBy: [{ memberCount: 'desc' }, { id: 'desc' }],
    take: COMMUNITIES_PAGE_SIZE + 1,
    select: COMMUNITY_SELECT,
  });
  const page = rows.slice(0, COMMUNITIES_PAGE_SIZE);
  if (page.length === 0) return { communities: [], nextCursor: null };
  const figures = await figuresFor(
    page.map((c) => c.id),
    now,
  );
  const last = page[page.length - 1];
  return {
    communities: page.map((c) => toRow(c, figures, now)),
    nextCursor: rows.length > COMMUNITIES_PAGE_SIZE && last ? encodeCommunityCursor(last) : null,
  };
}

export async function getAdminCommunity(slug: string, now: Date = new Date()): Promise<AdminCommunityDetail> {
  const core = await prisma.community.findUnique({ where: { slug }, select: COMMUNITY_SELECT });
  if (!core) throw new CommunityAdminRefused('not-found');
  const [figures, mods, log, reports] = await Promise.all([
    figuresFor([core.id], now),
    prisma.communityMember.findMany({
      where: { communityId: core.id, role: { in: ['MOD', 'ADMIN'] } },
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
      take: 100,
      select: { userId: true, role: true, user: { select: userChipSelect } },
    }),
    prisma.communityModAction.findMany({
      where: { communityId: core.id },
      orderBy: { createdAt: 'desc' },
      take: COMMUNITY_DETAIL_LOG_SIZE,
      select: { id: true, action: true, actorId: true, targetType: true, reason: true, createdAt: true },
    }),
    prisma.$queryRaw<{ id: string; reason: string; entityId: string; createdAt: Date }[]>(Prisma.sql`
      SELECT cr.id, cr.reason::text AS reason, cr."entityId" AS "entityId", cr."createdAt" AS "createdAt"
      FROM content_report cr
      JOIN rmheet r ON r.id = cr."entityId"
      WHERE cr."entityType" = 'rmhark'
        AND cr.status::text IN (${Prisma.join([...OPEN_REPORT_STATUSES])})
        AND r."communityId" = ${core.id}
      ORDER BY cr."createdAt" DESC
      LIMIT ${COMMUNITY_DETAIL_REPORT_SIZE}`),
  ]);
  const modRows = mods ?? [];
  const modIds = modRows.map((m) => m.userId);
  const lastByActor = modIds.length
    ? await prisma.communityModAction.groupBy({
        by: ['actorId'],
        where: { communityId: core.id, actorId: { in: modIds } },
        _max: { createdAt: true },
      })
    : [];
  const lastOf = new Map((Array.isArray(lastByActor) ? lastByActor : []).map((r) => [r.actorId, r._max.createdAt]));
  const logRows = log ?? [];
  const actorIds = [...new Set(logRows.map((l) => l.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: userChipSelect })
    : [];
  const actorName = new Map((Array.isArray(actors) ? actors : []).map((u) => [u.id, u.name || u.handle || null]));
  return {
    community: toRow(core, figures, now),
    moderators: modRows.map((m) => ({
      userId: m.userId,
      name: m.user.name || m.user.handle || '',
      handle: m.user.handle ?? null,
      role: m.role === 'ADMIN' ? ('ADMIN' as const) : ('MOD' as const),
      lastActionAt: iso(lastOf.get(m.userId) ?? null),
    })),
    log: logRows.map((l) => ({
      id: String(l.id),
      action: l.action,
      actorName: l.actorId ? (actorName.get(l.actorId) ?? null) : null,
      targetType: l.targetType,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    })),
    reports: (reports ?? []).map((r) => ({
      id: r.id,
      reason: r.reason,
      entityId: r.entityId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

async function dropDiscoveryCaches(communityId: string): Promise<void> {
  const related = await prisma.communitySister.findMany({
    where: { relatedCommunityId: communityId },
    select: { communityId: true },
  });
  const keys = [
    ...DISCOVERY_CACHE_KEYS,
    ...(Array.isArray(related) ? related : []).map((r) => `community:sisters:${r.communityId}`),
  ];
  await Promise.allSettled(keys.map((k) => invalidateCached(k)));
}

/** Take a community out of discovery. Audited in the same transaction; its moderators get one notice. */
export async function delistCommunity(
  adminId: string,
  slug: string,
  reason: string,
  now: Date = new Date(),
): Promise<AdminCommunityRow> {
  const community = await prisma.community.findUnique({ where: { slug }, select: COMMUNITY_SELECT });
  if (!community) throw new CommunityAdminRefused('not-found');
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `admin-communities:${community.id}`);
    const claimed = await tx.community.updateMany({
      where: { id: community.id, delistedAt: null },
      data: { delistedAt: now, delistedReason: reason, delistedById: adminId },
    });
    if (claimed.count === 0) throw new CommunityAdminRefused('already-out');
    await recordAdminActionIn(tx, adminId, 'community.delist', {
      targetType: 'community',
      targetId: community.id,
      detail: `${community.slug}: ${reason}`,
    });
  });
  await dropDiscoveryCaches(community.id);
  const mods = await prisma.communityMember.findMany({
    where: { communityId: community.id, role: { in: ['MOD', 'ADMIN'] } },
    select: { userId: true },
    take: 200,
  });
  await Promise.allSettled(
    (Array.isArray(mods) ? mods : []).map((m) =>
      createNotification({
        userId: m.userId,
        type: 'SYSTEM',
        entityType: 'community-delisted',
        entityId: community.id,
        link: `/c/${community.slug}`,
        preview: notice('community-delisted', { community: community.name, reason }),
      }),
    ),
  );
  return (await getAdminCommunity(community.slug, now)).community;
}

/** Return a community to discovery. Audited in the same transaction. */
export async function relistCommunity(
  adminId: string,
  slug: string,
  now: Date = new Date(),
): Promise<AdminCommunityRow> {
  const community = await prisma.community.findUnique({ where: { slug }, select: COMMUNITY_SELECT });
  if (!community) throw new CommunityAdminRefused('not-found');
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `admin-communities:${community.id}`);
    const claimed = await tx.community.updateMany({
      where: { id: community.id, delistedAt: { not: null } },
      data: { delistedAt: null, delistedReason: null, delistedById: null },
    });
    if (claimed.count === 0) throw new CommunityAdminRefused('not-out');
    await recordAdminActionIn(tx, adminId, 'community.relist', {
      targetType: 'community',
      targetId: community.id,
      detail: community.slug,
    });
  });
  await dropDiscoveryCaches(community.id);
  return (await getAdminCommunity(community.slug, now)).community;
}
