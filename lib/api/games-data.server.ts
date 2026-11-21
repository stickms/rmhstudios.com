/**
 * The queries behind the v1 games endpoints. Each is one or two indexed reads;
 * the shapes they return are built by `games-serializers.server.ts`.
 */

import { prisma } from '@/lib/prisma.server';
import {
  ACHIEVEMENTS,
  getAchievement,
} from '@/lib/achievements/catalog';
import { achievementsForTitle } from '@/lib/games/achievement-groups';
import {
  canViewPlaytime,
  isPlaytimePrivacy,
} from '@/lib/playtime/privacy';
import {
  serializeAchievement,
  serializeDays,
  serializePlaytime,
  encodeAchievementCursor,
  windowStart,
  type ApiAchievement,
  type ApiPlaytime,
  type ApiPlaytimeDay,
} from '@/lib/api/games-serializers.server';

/** A member's played titles with their last-7 and last-30-day minutes. */
export async function loadPlaytime(
  userId: string,
  now: Date = new Date(),
): Promise<
  ApiPlaytime[]
> {
  const [
    rows,
    days,
  ] =
    await Promise.all(
      [
        prisma.gamePlaytime.findMany(
          {
            where:
              {
                userId,
              },
            select:
              {
                gameId: true,
                totalSeconds: true,
                lastPlayedAt: true,
              },
          },
        ),
        prisma.gamePlaytimeDay.findMany(
          {
            where:
              {
                userId,
                day: {
                  gte: windowStart(
                    now,
                    30,
                  ),
                },
              },
            select:
              {
                gameId: true,
                day: true,
                seconds: true,
              },
          },
        ),
      ],
    );
  return serializePlaytime(
    rows,
    days,
    now,
  );
}

/** Minutes per day for one title over an already-validated range. */
export async function loadPlaytimeDays(
  userId: string,
  gameId: string,
  from: Date,
  to: Date,
): Promise<
  ApiPlaytimeDay[]
> {
  const rows =
    await prisma.gamePlaytimeDay.findMany(
      {
        where:
          {
            userId,
            gameId,
            day: {
              gte: from,
              lte: to,
            },
          },
        select:
          {
            day: true,
            seconds: true,
          },
      },
    );
  return serializeDays(
    rows,
    from,
    to,
  );
}

/**
 * The member whose playtime `viewerId` may read through `handle`, or null.
 * Unknown handle and hidden playtime are indistinguishable on purpose, and the
 * decision is the site's own `canViewPlaytime`.
 */
export async function resolveVisiblePlaytimeOwner(
  handle: string,
  viewerId: string,
): Promise<
  | string
  | null
> {
  const owner =
    await prisma.user.findUnique(
      {
        where:
          {
            handle:
              handle
                .replace(
                  /^@/,
                  '',
                )
                .toLowerCase(),
          },
        select:
          {
            id: true,
            playtimePrivacy: true,
            bannedUntil: true,
          },
      },
    );
  if (
    !owner
  )
    return null;
  if (
    owner.id !==
    viewerId
  ) {
    // A banned member reads as gone, and a block in either direction reads as
    // not found (the same answer as an unknown handle).
    if (
      owner.bannedUntil &&
      owner.bannedUntil.getTime() >
        Date.now()
    )
      return null;
    const blocked =
      await prisma.userBlock.findFirst(
        {
          where:
            {
              OR: [
                {
                  blockerId:
                    viewerId,
                  blockedId:
                    owner.id,
                },
                {
                  blockerId:
                    owner.id,
                  blockedId:
                    viewerId,
                },
              ],
            },
          select:
            {
              id: true,
            },
        },
      );
    if (
      blocked
    )
      return null;
  }
  const setting =
    isPlaytimePrivacy(
      owner.playtimePrivacy,
    )
      ? owner.playtimePrivacy
      : 'private';
  const follows =
    owner.id !==
      viewerId &&
    setting ===
      'followers'
      ? !!(await prisma.follow.findFirst(
          {
            where:
              {
                followerId:
                  viewerId,
                followingId:
                  owner.id,
              },
            select:
              {
                id: true,
              },
          },
        ))
      : false;
  return canViewPlaytime(
    setting,
    {
      viewerId,
      ownerId:
        owner.id,
      viewerFollowsOwner:
        follows,
    },
  )
    ? owner.id
    : null;
}

/** Ids of the achievements the API may show: every one that is not secret. */
function listableAchievementIds(
  gameId:
    | string
    | undefined,
): string[] {
  const defs =
    ACHIEVEMENTS.filter(
      (
        a,
      ) =>
        !a.secret,
    );
  return (
    gameId
      ? achievementsForTitle(
          gameId,
          defs,
        )
      : defs
  ).map(
    (
      a,
    ) =>
      a.id,
  );
}

/**
 * The key owner's unlocked, non-secret achievements, newest first, with each
 * one's rarity. Only `userId`'s rows are read.
 */
export async function loadUnlockedAchievements(
  userId: string,
  opts: {
    gameId?:
      | string
      | undefined;
    cursor: {
      unlockedAt: Date;
      id: string;
    } | null;
    limit: number;
  },
): Promise<{
  data: ApiAchievement[];
  nextCursor:
    | string
    | null;
}> {
  const ids =
    listableAchievementIds(
      opts.gameId,
    );
  if (
    ids.length ===
    0
  )
    return {
      data: [],
      nextCursor:
        null,
    };
  const c =
    opts.cursor;
  const rows =
    await prisma.userAchievement.findMany(
      {
        where:
          {
            userId,
            achievementId:
              {
                in: ids,
              },
            unlockedAt:
              c
                ? {
                    not: null,
                    lte: c.unlockedAt,
                  }
                : {
                    not: null,
                  },
            ...(c
              ? {
                  OR: [
                    {
                      unlockedAt:
                        {
                          lt: c.unlockedAt,
                        },
                    },
                    {
                      unlockedAt:
                        c.unlockedAt,
                      id: {
                        lt: c.id,
                      },
                    },
                  ],
                }
              : {}),
          },
        orderBy:
          [
            {
              unlockedAt:
                'desc',
            },
            {
              id: 'desc',
            },
          ],
        take:
          opts.limit +
          1,
        select:
          {
            id: true,
            achievementId: true,
            unlockedAt: true,
          },
      },
    );
  const hasMore =
    rows.length >
    opts.limit;
  const page =
    (
      hasMore
        ? rows.slice(
            0,
            opts.limit,
          )
        : rows
    ).flatMap(
      (
        r,
      ) =>
        r.unlockedAt
          ? [
              {
                id: r.id,
                achievementId:
                  r.achievementId,
                unlockedAt:
                  r.unlockedAt,
              },
            ]
          : [],
    );
  const rarity =
    page.length
      ? await prisma.achievementRarity.findMany(
          {
            where:
              {
                achievementId:
                  {
                    in: page.map(
                      (
                        r,
                      ) =>
                        r.achievementId,
                    ),
                  },
              },
            select:
              {
                achievementId: true,
                pct: true,
              },
          },
        )
      : [];
  const pctById =
    new Map(
      rarity.map(
        (
          r,
        ) => [
          r.achievementId,
          r.pct,
        ],
      ),
    );
  const data =
    page.flatMap(
      (
        r,
      ) => {
        const def =
          getAchievement(
            r.achievementId,
          );
        const item =
          def
            ? serializeAchievement(
                r,
                def,
                pctById.get(
                  r.achievementId,
                ),
              )
            : null;
        return item
          ? [
              item,
            ]
          : [];
      },
    );
  const last =
    page[
      page.length -
        1
    ];
  return {
    data,
    nextCursor:
      hasMore &&
      last
        ? encodeAchievementCursor(
            last,
          )
        : null,
  };
}
