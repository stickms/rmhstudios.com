/**
 * Friends' progress reads (RMH Music Phase 6, plan 1.5 and 1.7). The rules are `friends.ts`; this
 * file applies the access rules and reads the rows.
 *
 * - **Reciprocal:** the viewer sees friends only while their own friends switch is on.
 * - **Who:** mutual follows only (`loadMutuals`, the site's definition through
 *   `scopeFilter('friends')`, cached per viewer for 30 s and dropped by the viewer's own switch
 *   change), whose friends switch is on, not banned or deleted (a tombstone is banned until 9999)
 *   and not a bot, minus every block either way (`getBlockedAuthorIds`, which fails closed: a
 *   failed lookup fails the request). Blocking also deletes the follows, but the cached mutuals
 *   can still hold the pair for 30 s, so blocks are applied here too.
 * - **Consent is read fresh** on every request: a friend who turns the switch off leaves the list
 *   on the viewer's next read; only the mutuals list is cached.
 * - **What leaves the server** about a friend: a display name and an avatar, the Daily challenge
 *   streak and whether today's is done, finished units (count, total, the last one's title) and
 *   song bests. No id, handle, link, instrument, input or latency (`friendsRes` drops any other key).
 */
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { prisma } from '@/lib/prisma.server';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';
import type {
  FriendProgress,
  FriendsProgress,
} from '@/lib/music-social/friends.contract';
import { pathFor } from '../content/path';
import { utcDate } from '../sprint/generate';
import {
  eligibleUser,
  loadMutuals,
} from './board.server';
import {
  compareFriends,
  finishedUnits,
  friendDaily,
  friendSongs,
  STREAK_LOOKBACK_DAYS,
  type FriendsLimit,
} from './friends';
import { getMusicSocial } from './prefs.server';

const DAY_MS = 86_400_000;

/** The most sharing friends one request reads (the mutuals list is itself capped by the scope). */
const FRIENDS_READ_CAP = 500;

function groupBy<
  T extends
    {
      userId: string;
    },
>(
  rows: readonly T[],
): Map<
  string,
  T[]
> {
  const out =
    new Map<
      string,
      T[]
    >();
  for (const r of rows) {
    const list =
      out.get(
        r.userId,
      );
    if (
      list
    )
      list.push(
        r,
      );
    else
      out.set(
        r.userId,
        [
          r,
        ],
      );
  }
  return out;
}

export async function loadFriendsProgress(
  viewerId: string,
  limit: FriendsLimit,
  now: number,
): Promise<FriendsProgress> {
  const social =
    await getMusicSocial(
      viewerId,
    );
  if (
    !social.friends
  )
    return {
      optedIn: false,
      total: 0,
      friends:
        [],
    };

  // Access control before any friend's row is read: a failed lookup throws.
  const blocked =
    new Set(
      await getBlockedAuthorIds(
        viewerId,
      ),
    );
  const mutuals =
    (
      await loadMutuals(
        viewerId,
      )
    ).filter(
      (
        id,
      ) =>
        !blocked.has(
          id,
        ) &&
        id !==
          viewerId,
    );
  if (
    mutuals.length ===
    0
  )
    return {
      optedIn: true,
      total: 0,
      friends:
        [],
    };

  const users =
    await prisma.user.findMany(
      {
        where:
          {
            id: {
              in: mutuals,
            },
            ...eligibleUser(
              new Date(
                now,
              ),
            ),
            musicSocial:
              {
                is: {
                  friends: true,
                },
              },
          },
        select:
          userDisplaySelect,
        take: FRIENDS_READ_CAP,
      },
    );
  const ids =
    users.map(
      (
        u,
      ) =>
        u.id,
    );
  if (
    ids.length ===
    0
  )
    return {
      optedIn: true,
      total: 0,
      friends:
        [],
    };

  const today =
    utcDate(
      now,
    );
  const [
    profiles,
    lessons,
    daily,
    songs,
  ] =
    await Promise.all(
      [
        prisma.musicLearnProfile.findMany(
          {
            where:
              {
                userId:
                  {
                    in: ids,
                  },
              },
            select:
              {
                userId: true,
                instrument: true,
              },
          },
        ),
        prisma.musicLearnLessonProgress.findMany(
          {
            where:
              {
                userId:
                  {
                    in: ids,
                  },
                stars:
                  {
                    gte: 1,
                  },
              },
            select:
              {
                userId: true,
                lessonId: true,
              },
          },
        ),
        prisma.musicSprintDaily.findMany(
          {
            where:
              {
                userId:
                  {
                    in: ids,
                  },
                score:
                  {
                    not: null,
                  },
                date: {
                  gte: utcDate(
                    now -
                      STREAK_LOOKBACK_DAYS *
                        DAY_MS,
                  ),
                },
              },
            select:
              {
                userId: true,
                date: true,
              },
          },
        ),
        prisma.musicSongBest.findMany(
          {
            where:
              {
                userId:
                  {
                    in: ids,
                  },
              },
            select:
              {
                userId: true,
                songId: true,
                mode: true,
                bestScore: true,
              },
          },
        ),
      ],
    );
  const instrumentOf =
    new Map(
      profiles.map(
        (
          p,
        ) => [
          p.userId,
          p.instrument,
        ],
      ),
    );
  const starredBy =
    groupBy(
      lessons,
    );
  const datesBy =
    groupBy(
      daily,
    );
  const songsBy =
    groupBy(
      songs,
    );

  const rows =
    users.map(
      (
        u,
      ) => {
        const who =
          resolveUser(
            u,
          );
        const instrument =
          instrumentOf.get(
            u.id,
          );
        const path =
          pathFor(
            instrument ===
              'guitar' ||
              instrument ===
                'voice'
              ? instrument
              : 'piano',
          );
        const d =
          friendDaily(
            (
              datesBy.get(
                u.id,
              ) ??
              []
            ).map(
              (
                r,
              ) =>
                r.date,
            ),
            today,
          );
        const progress: FriendProgress =
          {
            user: {
              name: who.name,
              image:
                who.image,
            },
            daily:
              d,
            units:
              finishedUnits(
                path,
                new Set(
                  (
                    starredBy.get(
                      u.id,
                    ) ??
                    []
                  ).map(
                    (
                      r,
                    ) =>
                      r.lessonId,
                  ),
                ),
              ),
            songs:
              friendSongs(
                songsBy.get(
                  u.id,
                ) ??
                  [],
              ),
          };
        return {
          key: {
            name: who.name,
            streak:
              d.streak,
            today:
              d.today,
            userId:
              u.id,
          },
          progress,
        };
      },
    );
  rows.sort(
    (
      a,
      b,
    ) =>
      compareFriends(
        a.key,
        b.key,
      ),
  );
  return {
    optedIn: true,
    total:
      rows.length,
    friends:
      rows
        .slice(
          0,
          limit,
        )
        .map(
          (
            r,
          ) =>
            r.progress,
        ),
  };
}
