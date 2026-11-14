/**
 * Friends leagues for election predictions. Client-safe and pure: limits, validation, the lock time and the
 * leaderboard. Persistence is `leagues.server.ts`.
 *
 * Nothing here involves coins: a league is a code, a painted map per member, and a score. A member's calls
 * freeze when the first polls close, so nobody can edit a map after seeing the first results.
 */

import { z } from 'zod';
import {
  firstCloseAt,
  parseDay,
} from './calendar';
import {
  scorePicks,
  type Call,
  type Picks,
  type Score,
} from './predict';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './room-config';
import type { Race } from './types';

export const MAX_LEAGUES_PER_USER = 10;
export const MAX_MEMBERS = 50;
export const MAX_PICKS = 200;

export const leagueNameSchema =
  z
    .string()
    .transform(
      (
        s,
      ) =>
        [
          ...s,
        ]
          .filter(
            (
              c,
            ) =>
              c.charCodeAt(
                0,
              ) >
              31,
          )
          .join(
            '',
          )
          .replace(
            /\s+/g,
            ' ',
          )
          .trim(),
    )
    .pipe(
      z
        .string()
        .min(
          2,
        )
        .max(
          60,
        ),
    );

export const leagueCreateSchema =
  z.object(
    {
      name: leagueNameSchema,
      cycle:
        z
          .string()
          .min(
            4,
          )
          .max(
            10,
          ),
    },
  );

const CODE =
  new RegExp(
    `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
  );
export const isLeagueCode =
  (
    s: string,
  ): boolean =>
    CODE.test(
      s,
    );

const KEY =
  /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * Whatever a client sends becomes a clean `Picks`: only known calls, only well-formed keys, only races that
 * exist when we know the race list, and never more than MAX_PICKS entries.
 */
export function sanitizePicks(
  raw: unknown,
  valid?: ReadonlySet<string>,
): Picks {
  if (
    !raw ||
    typeof raw !==
      'object' ||
    Array.isArray(
      raw,
    )
  )
    return {};
  const out: Picks =
    {};
  let n = 0;
  for (const [
    k,
    v,
  ] of Object.entries(
    raw as Record<
      string,
      unknown
    >,
  )) {
    if (
      n >=
      MAX_PICKS
    )
      break;
    if (
      !KEY.test(
        k,
      ) ||
      (v !==
        'DEM' &&
        v !==
          'GOP' &&
        v !==
          'TOSS')
    )
      continue;
    if (
      valid &&
      valid.size &&
      !valid.has(
        k,
      )
    )
      continue;
    out[
      k
    ] =
      v as Call;
    n++;
  }
  return out;
}

export const picksBodySchema =
  z.object(
    {
      picks:
        z.record(
          z.string(),
          z.unknown(),
        ),
    },
  );

/** When the maps freeze: the first polls closing on a general election day. `null` = never (specials, primaries). */
export function leagueLockAt(
  cycleParam: string,
): Date | null {
  const c =
    parseDay(
      cycleParam,
    );
  if (
    !c ||
    c.kind ===
      'other'
  )
    return null;
  return firstCloseAt(
    c.date,
  );
}

export const isLocked =
  (
    cycleParam: string,
    now: Date = new Date(),
  ): boolean => {
    const at =
      leagueLockAt(
        cycleParam,
      );
    return (
      at !=
        null &&
      now.getTime() >=
        at.getTime()
    );
  };

export interface LeagueMemberRow {
  userId: string;
  name:
    | string
    | null;
  handle:
    | string
    | null;
  image:
    | string
    | null;
  picks: Picks;
  pickedAt:
    | string
    | null;
}

export interface LeagueStanding extends Omit<
  LeagueMemberRow,
  'picks'
> {
  score: Score;
  /** Calls made (Dem or GOP), whether or not their race has been decided. */
  calls: number;
  /** 1-based; equal scores share a rank. */
  rank: number;
}

/** Score every member against the races and rank them: most right, then fewest wrong, then earliest map. */
export function leaderboard(
  members: LeagueMemberRow[],
  races: Race[],
): LeagueStanding[] {
  const scored =
    members.map(
      (
        m,
      ) => {
        const score =
          scorePicks(
            m.picks,
            races,
          );
        const calls =
          Object.values(
            m.picks,
          ).filter(
            (
              c,
            ) =>
              c ===
                'DEM' ||
              c ===
                'GOP',
          ).length;
        const {
          picks:
            _picks,
          ...rest
        } =
          m;
        return {
          ...rest,
          score,
          calls,
        };
      },
    );
  scored.sort(
    (
      a,
      b,
    ) =>
      b
        .score
        .correct -
        a
          .score
          .correct ||
      a
        .score
        .wrong -
        b
          .score
          .wrong ||
      (
        a.pickedAt ??
        '9'
      ).localeCompare(
        b.pickedAt ??
          '9',
      ) ||
      (
        a.name ??
        ''
      ).localeCompare(
        b.name ??
          '',
      ),
  );
  let rank = 0;
  let prev:
    | (typeof scored)[number]
    | null =
    null;
  return scored.map(
    (
      s,
      i,
    ) => {
      if (
        !prev ||
        prev
          .score
          .correct !==
          s
            .score
            .correct ||
        prev
          .score
          .wrong !==
          s
            .score
            .wrong
      )
        rank =
          i +
          1;
      prev =
        s;
      return {
        ...s,
        rank,
      };
    },
  );
}

export interface LeagueView {
  code: string;
  name: string;
  cycle: string;
  owner: {
    id: string;
    name:
      | string
      | null;
  } | null;
  /** The viewer is a member (and so may see the board). */
  joined: boolean;
  isOwner: boolean;
  memberCount: number;
  /** Members only. */
  standings: LeagueStanding[];
  /** The viewer's own picks, so the UI can show what is saved. */
  myPicks: Picks | null;
  lockAt:
    | string
    | null;
  locked: boolean;
}

export interface LeagueListItem {
  code: string;
  name: string;
  cycle: string;
  memberCount: number;
  isOwner: boolean;
}
