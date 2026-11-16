/**
 * The Daily board's reads (RMH Music Phase 6, plan 1.2 and 1.7). The rules are `board.ts`; this
 * file reads rows, applies the access rules and resolves names.
 *
 * - **Everyone:** one cached sorted list per date (`boardCacheKey`, 30 s; dropped at once by a
 *   switch change, a moderator's hide and a newly ranked run), built by one query with every
 *   filter of plan 1.2: scored, ranked, not hidden, the learner's board switch on, not banned or
 *   deleted (a tombstone is banned until 9999), not a bot. Per request: drop the viewer's blocked
 *   ids (`getBlockedAuthorIds`, which fails closed: a failed lookup fails the request), slice the
 *   top and "around you", then load display data for at most 55 learners.
 * - **Friends:** mutual follows only (`scopeFilter('friends')`; a one-way follower never appears),
 *   with either switch on, plus the viewer; ranked among themselves. Needs the viewer's own friends
 *   switch (no one-sided watching). The mutuals list is cached per viewer for 30 s.
 * - **The viewer's line** is read fresh on every request.
 * - **What leaves the server** about another learner: a display name and an avatar (no handle, no
 *   link, no instrument), the score, the mean answer time and whether chords were skipped.
 */
import {
  cached,
  invalidateCached,
} from '@/lib/cached.server';
import { scopeFilter } from '@/lib/game/leaderboard-scope.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { prisma } from '@/lib/prisma.server';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';
import {
  BOARD_MAX_ROWS,
  boardMe,
  isFinal,
  rankEntries,
  sliceBoard,
  type BoardEntry,
  type BoardMe,
  type RankedEntry,
} from './board';
import {
  boardCacheKey,
  friendsCacheKey,
} from './cache-keys';
import type {
  BoardScope,
  DailyBoard,
  DailyBoardRow,
} from './social.contract';
import { getMusicSocial } from './prefs.server';

const BOARD_TTL_MS = 30_000;
const FRIENDS_TTL_MS = 30_000;

/** Not banned (a lapsed ban is fine), which also leaves out deleted accounts, and not a bot. */
function eligibleUser(
  now: Date,
) {
  return {
    isBot: false,
    OR: [
      {
        bannedUntil:
          null,
      },
      {
        bannedUntil:
          {
            lt: now,
          },
      },
    ],
  };
}

const ENTRY_SELECT =
  {
    id: true,
    userId: true,
    score: true,
    avgMs: true,
    scoredAt: true,
    skipped: true,
  } as const;

type EntryRow =
  {
    id: string;
    userId: string;
    score:
      | number
      | null;
    avgMs:
      | number
      | null;
    scoredAt: Date | null;
    skipped:
      | number
      | null;
  };

function toEntry(
  r: EntryRow,
): BoardEntry | null {
  if (
    r.score ===
    null
  )
    return null;
  return {
    rowId:
      r.id,
    userId:
      r.userId,
    score:
      r.score,
    avgMs:
      r.avgMs,
    scoredAt:
      r.scoredAt
        ? r.scoredAt.getTime()
        : 0,
    skipped:
      r.skipped ??
      0,
  };
}

const ORDER =
  [
    {
      score:
        'desc' as const,
    },
    {
      avgMs:
        {
          sort: 'asc' as const,
          nulls:
            'last' as const,
        },
    },
    {
      scoredAt:
        'asc' as const,
    },
    {
      userId:
        'asc' as const,
    },
  ];

/** The date's Everyone board: every opted-in, ranked run, ordered (cached per date). */
export function loadEveryone(
  date: string,
): Promise<
  BoardEntry[]
> {
  return cached(
    boardCacheKey(
      date,
    ),
    BOARD_TTL_MS,
    async () => {
      const rows =
        await prisma.musicSprintDaily.findMany(
          {
            where:
              {
                date,
                score:
                  {
                    not: null,
                  },
                ranked: true,
                hiddenAt:
                  null,
                user: {
                  ...eligibleUser(
                    new Date(),
                  ),
                  musicSocial:
                    {
                      is: {
                        board: true,
                      },
                    },
                },
              },
            select:
              ENTRY_SELECT,
            orderBy:
              ORDER,
            take: BOARD_MAX_ROWS,
          },
        );
      return rows.flatMap(
        (
          r,
        ) =>
          toEntry(
            r,
          ) ??
          [],
      );
    },
  );
}

/** Drop a date's cached Everyone board (a newly ranked run, a hide). */
export function invalidateBoard(
  date: string,
): Promise<void> {
  return invalidateCached(
    boardCacheKey(
      date,
    ),
  );
}

/** The viewer's mutual follows (cached per viewer): the site's definition of friends. */
export function loadMutuals(
  viewerId: string,
): Promise<
  string[]
> {
  return cached(
    friendsCacheKey(
      viewerId,
    ),
    FRIENDS_TTL_MS,
    async () => {
      const scope =
        await scopeFilter(
          'friends',
          viewerId,
        );
      if (
        !scope.supported ||
        !scope.audience
      )
        return [];
      return scope.audience.filter(
        (
          id,
        ) =>
          id !==
          viewerId,
      );
    },
  );
}

/** The date's Friends board: mutuals with either switch on, plus the viewer. */
async function loadFriendsEntries(
  viewerId: string,
  date: string,
  now: number,
): Promise<
  BoardEntry[]
> {
  const mutuals =
    await loadMutuals(
      viewerId,
    );
  const rows =
    await prisma.musicSprintDaily.findMany(
      {
        where:
          {
            date,
            userId:
              {
                in: [
                  ...mutuals,
                  viewerId,
                ],
              },
            score:
              {
                not: null,
              },
            ranked: true,
            hiddenAt:
              null,
            user: {
              ...eligibleUser(
                new Date(
                  now,
                ),
              ),
              musicSocial:
                {
                  is: {
                    OR: [
                      {
                        board: true,
                      },
                      {
                        friends: true,
                      },
                    ],
                  },
                },
            },
          },
        select:
          ENTRY_SELECT,
        orderBy:
          ORDER,
        take: BOARD_MAX_ROWS,
      },
    );
  return rows.flatMap(
    (
      r,
    ) =>
      toEntry(
        r,
      ) ??
      [],
  );
}

/** The viewer's own line for `date`, read fresh. `everyone` may be passed when already loaded. */
export async function loadBoardMe(
  viewerId: string,
  date: string,
  everyone?: readonly RankedEntry[],
): Promise<BoardMe> {
  const [
    row,
    social,
    ranked,
  ] =
    await Promise.all(
      [
        prisma.musicSprintDaily.findUnique(
          {
            where:
              {
                userId_date:
                  {
                    userId:
                      viewerId,
                    date,
                  },
              },
            select:
              {
                score: true,
                avgMs: true,
                scoredAt: true,
                ranked: true,
                unrankedReason: true,
                hiddenAt: true,
              },
          },
        ),
        getMusicSocial(
          viewerId,
        ),
        everyone
          ? Promise.resolve(
              everyone,
            )
          : loadEveryone(
              date,
            ).then(
              rankEntries,
            ),
      ],
    );
  return boardMe(
    viewerId,
    row
      ? {
          score:
            row.score,
          avgMs:
            row.avgMs,
          scoredAt:
            row.scoredAt
              ? row.scoredAt.getTime()
              : null,
          ranked:
            row.ranked,
          unrankedReason:
            row.unrankedReason,
          hidden:
            row.hiddenAt !==
            null,
        }
      : null,
    social.board,
    ranked,
  );
}

/** Names and avatars for the rows shown (at most 55 learners). */
async function displayRows(
  entries: readonly RankedEntry[],
  viewerId: string,
): Promise<
  DailyBoardRow[]
> {
  const ids =
    [
      ...new Set(
        entries.map(
          (
            e,
          ) =>
            e.userId,
        ),
      ),
    ];
  const users =
    ids.length
      ? await prisma.user.findMany(
          {
            where:
              {
                id: {
                  in: ids,
                },
              },
            select:
              userDisplaySelect,
          },
        )
      : [];
  const byId =
    new Map(
      users.map(
        (
          u,
        ) => {
          const r =
            resolveUser(
              u,
            );
          return [
            r.id,
            {
              id: r.id,
              name: r.name,
              image:
                r.image,
            },
          ] as const;
        },
      ),
    );
  return entries.map(
    (
      e,
    ) => ({
      rank: e.rank,
      rowId:
        e.rowId,
      user: byId.get(
        e.userId,
      ) ?? {
        id: e.userId,
        name: null,
        image:
          null,
      },
      score:
        e.score,
      avgMs:
        e.avgMs,
      withoutChords:
        e.skipped >
        0,
      you:
        e.userId ===
        viewerId,
    }),
  );
}

/** `GET /api/rmhmusic/sprint/board`: the date must already be today or yesterday (`boardDateOk`). */
export async function loadBoard(
  viewerId: string,
  date: string,
  scope: BoardScope,
  now: number,
): Promise<DailyBoard> {
  // Access control first: a failed lookup throws and fails the request.
  const blocked =
    new Set(
      await getBlockedAuthorIds(
        viewerId,
      ),
    );
  const [
    everyone,
    social,
  ] =
    await Promise.all(
      [
        loadEveryone(
          date,
        ).then(
          rankEntries,
        ),
        getMusicSocial(
          viewerId,
        ),
      ],
    );
  const me =
    await loadBoardMe(
      viewerId,
      date,
      everyone,
    );
  const final =
    isFinal(
      date,
      now,
    );
  if (
    scope ===
      'friends' &&
    !social.friends
  ) {
    return {
      date,
      final,
      total: 0,
      rows: [],
      around:
        null,
      me,
      friendsOff: true,
    };
  }
  const ranked =
    scope ===
    'friends'
      ? rankEntries(
          await loadFriendsEntries(
            viewerId,
            date,
            now,
          ),
        )
      : everyone;
  const slice =
    sliceBoard(
      ranked,
      viewerId,
      blocked,
    );
  const [
    rows,
    around,
  ] =
    await Promise.all(
      [
        displayRows(
          slice.rows,
          viewerId,
        ),
        slice.around
          ? displayRows(
              slice.around,
              viewerId,
            )
          : Promise.resolve(
              null,
            ),
      ],
    );
  return {
    date,
    final,
    total:
      ranked.length,
    rows,
    around,
    me,
  };
}
