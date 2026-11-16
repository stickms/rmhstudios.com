/**
 * The Daily board's reads (RMH Music Phase 6, plan 1.2 and 1.7). The rules are `board.ts`; this
 * file reads rows, applies the access rules and resolves names.
 *
 * - **Everyone:** one cached sorted list per date (`board-cache.server.ts`: 30 s under a per-date
 *   generation, 5 s in-process without Redis; dropped everywhere at once by a switch change, a
 *   newly ranked run, a moderator's hide, a ban or unban and an account deletion), built by one
 *   query with every
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
import { cached } from '@/lib/cached.server';
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
  type ViewerRow,
} from './board';
import { cachedBoard } from './board-cache.server';
import { friendsCacheKey } from './cache-keys';
import type {
  BoardScope,
  DailyBoard,
  DailyBoardRow,
} from '@/lib/music-social/social.contract';
import { getMusicSocial } from './prefs.server';

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

/**
 * The date's Everyone board: every opted-in, ranked run, ordered (cached per date and generation,
 * `board-cache.server.ts`). `now` is the request's clock, the same one the Friends board reads.
 */
export function loadEveryone(
  date: string,
  now: number,
): Promise<
  BoardEntry[]
> {
  return cachedBoard(
    date,
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
                    new Date(
                      now,
                    ),
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

/** The viewer's own row of `date`, read fresh (never cached). */
async function readViewerRow(
  viewerId: string,
  date: string,
): Promise<ViewerRow | null> {
  const row =
    await prisma.musicSprintDaily.findUnique(
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
    );
  return row
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
    : null;
}

/** The viewer's own line for `date` on the Everyone board (the daily save's `board` field). */
export async function loadBoardMe(
  viewerId: string,
  date: string,
  now: number,
): Promise<BoardMe> {
  const [
    row,
    social,
    ranked,
  ] =
    await Promise.all(
      [
        readViewerRow(
          viewerId,
          date,
        ),
        getMusicSocial(
          viewerId,
        ),
        loadEveryone(
          date,
          now,
        ).then(
          rankEntries,
        ),
      ],
    );
  return boardMe(
    viewerId,
    row,
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

/**
 * `GET /api/rmhmusic/sprint/board`: the date must already be today or yesterday (`boardDateOk`).
 * The viewer's line is their place on the board asked for: on the Friends tab, among friends
 * (where they are shown while either switch is on; the tab needs the friends switch).
 */
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
    row,
  ] =
    await Promise.all(
      [
        loadEveryone(
          date,
          now,
        ).then(
          rankEntries,
        ),
        getMusicSocial(
          viewerId,
        ),
        readViewerRow(
          viewerId,
          date,
        ),
      ],
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
      me: boardMe(
        viewerId,
        row,
        social.board,
        everyone,
      ),
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
  const me =
    scope ===
    'friends'
      ? boardMe(
          viewerId,
          row,
          true,
          ranked,
        )
      : boardMe(
          viewerId,
          row,
          social.board,
          everyone,
        );
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
