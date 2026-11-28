/**
 * Adapters from the v1 shapes (`/api/v1/tournaments*`, `/api/v1/me/tournaments`) to the functions the
 * site uses. The reads are one query per page with the entrants joined (no per-match lookups). The
 * writes ARE the site's `checkIn`, `claimResult`, `confirmResult` and `withdrawClaim`: this module takes
 * no lock and re-implements no rule, it only maps the key owner's `me` / `opponent` to entrants and
 * the refusals to the v1 envelope.
 *
 * No write moves coins. Registration, withdrawal and creation are not here. Settling the match that
 * completes a tournament pays its prize pool, and a claim can do that too (the opponent's claim of the
 * claimed winner IS a confirmation), so both `claim` and `confirm` pass `refuseIfPays` to the site
 * function, which refuses with `confirm_on_site` under its own match lock, before the claim is consumed. A claim that would dispute is refused: disputes
 * stay on the site.
 */
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect } from '@/lib/user-display';
import { checkIn } from '@/lib/tournaments/checkin.server';
import { claimResult, confirmResult, withdrawClaim } from '@/lib/tournaments/match-results.server';
import { TournamentError } from '@/lib/tournaments/tournament-error';
import {
  refusalOf,
  serializeMatch,
  serializeTournament,
  type ApiMatch,
  type ApiMyTournament,
  type ApiTournament,
  type ApiTournamentDetail,
  type Refusal,
} from '@/lib/api/v1/tournaments-shape';
import {
  decodeSlotCursor,
  decodeTimeCursor,
  encodeSlotCursor,
  encodeTimeCursor,
  type claimBody,
  type listQuery,
  type matchesQuery,
  type myTournamentsQuery,
} from '@/lib/api/v1/tournaments-schema';

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

const entrantSelect = {
  id: true,
  userId: true,
  seed: true,
  user: {
    select: userDisplaySelect,
  },
} as const;

const matchInclude = {
  entrantA: {
    select: entrantSelect,
  },
  entrantB: {
    select: entrantSelect,
  },
} as const;

const tournamentInclude = {
  createdBy: {
    select: userDisplaySelect,
  },
  _count: {
    select: {
      entrants: true,
    },
  },
} as const;

/** Rows older than the cursor in `(createdAt desc, id desc)` order. */
const beforeCursor = (c: { ms: number; id: string }) => ({
  OR: [
    {
      createdAt: {
        lt: new Date(c.ms),
      },
    },
    {
      createdAt: new Date(c.ms),
      id: {
        lt: c.id,
      },
    },
  ],
});

/** Public tournaments, newest first; `status` and `game` narrow it. An unlisted one is never listed. */
export async function listTournamentsForKey(
  q: z.infer<typeof listQuery>,
): Promise<Page<ApiTournament> | 'invalid_cursor'> {
  const c = q.cursor ? decodeTimeCursor(q.cursor) : null;
  if (q.cursor && !c) return 'invalid_cursor';
  const where: Prisma.TournamentWhereInput = {
    visibility: 'public',
    status: q.status ?? {
      not: 'CANCELLED',
    },
    ...(q.game
      ? {
          gameId: q.game,
        }
      : {}),
    ...(c ? beforeCursor(c) : {}),
  };
  const rows = await prisma.tournament.findMany({
    where,
    include: tournamentInclude,
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: q.limit + 1,
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    data: page.map(serializeTournament),
    nextCursor:
      rows.length > q.limit && last
        ? encodeTimeCursor({
            ms: last.createdAt.getTime(),
            id: last.id,
          })
        : null,
  };
}

/** One tournament by id: exactly what the site page shows (an unlisted one is reachable by id). */
export async function getTournamentForKey(id: string, userId: string): Promise<ApiTournamentDetail | null> {
  const t = await prisma.tournament.findUnique({
    where: {
      id,
    },
    include: {
      ...tournamentInclude,
      entrants: {
        where: {
          userId,
        },
        select: {
          checkedInAt: true,
        },
      },
    },
  });
  if (!t) return null;
  const mine = t.entrants[0];
  return {
    ...serializeTournament(t),
    you: {
      entered: !!mine,
      checkedIn: mine?.checkedInAt != null,
    },
  };
}

/** The bracket, round by round: one page of matches with both sides joined. */
export async function listMatchesForKey(
  id: string,
  userId: string,
  q: z.infer<typeof matchesQuery>,
): Promise<Page<ApiMatch> | 'invalid_cursor' | null> {
  const c = q.cursor ? decodeSlotCursor(q.cursor) : null;
  if (q.cursor && !c) return 'invalid_cursor';
  const t = await prisma.tournament.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      createdById: true,
    },
  });
  if (!t) return null;
  const rows = await prisma.tournamentMatch.findMany({
    where: {
      tournamentId: t.id,
      ...(c
        ? {
            OR: [
              {
                round: {
                  gt: c.round,
                },
              },
              {
                round: c.round,
                slot: {
                  gt: c.slot,
                },
              },
            ],
          }
        : {}),
    },
    include: matchInclude,
    orderBy: [
      {
        round: 'asc',
      },
      {
        slot: 'asc',
      },
    ],
    take: q.limit + 1,
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  const viewer = {
    userId,
    hostId: t.createdById,
  };
  return {
    data: page.map((m) => serializeMatch(m, viewer)),
    nextCursor:
      rows.length > q.limit && last
        ? encodeSlotCursor({
            round: last.round,
            slot: last.slot,
          })
        : null,
  };
}

/** The key owner's entries, newest first, each with the match they are due to play. */
export async function listMyTournamentsForKey(
  userId: string,
  q: z.infer<typeof myTournamentsQuery>,
): Promise<Page<ApiMyTournament> | 'invalid_cursor'> {
  const c = q.cursor ? decodeTimeCursor(q.cursor) : null;
  if (q.cursor && !c) return 'invalid_cursor';
  const entries = await prisma.tournamentEntrant.findMany({
    where: {
      userId,
      ...(q.status
        ? {
            tournament: {
              status: q.status,
            },
          }
        : {}),
      ...(c
        ? {
            OR: [
              {
                joinedAt: {
                  lt: new Date(c.ms),
                },
              },
              {
                joinedAt: new Date(c.ms),
                id: {
                  lt: c.id,
                },
              },
            ],
          }
        : {}),
    },
    include: {
      tournament: {
        include: tournamentInclude,
      },
    },
    orderBy: [
      {
        joinedAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: q.limit + 1,
  });
  const page = entries.slice(0, q.limit);
  const last = page[page.length - 1];
  const entrantIds = page.map((e) => e.id);
  // One query for every open match of these entries, both sides joined.
  const open = entrantIds.length
    ? await prisma.tournamentMatch.findMany({
        where: {
          state: {
            in: ['READY', 'LIVE'],
          },
          tournamentId: {
            in: page.map((e) => e.tournamentId),
          },
          OR: [
            {
              entrantAId: {
                in: entrantIds,
              },
            },
            {
              entrantBId: {
                in: entrantIds,
              },
            },
          ],
        },
        include: matchInclude,
        orderBy: [
          {
            round: 'asc',
          },
          {
            slot: 'asc',
          },
        ],
      })
    : [];
  return {
    data: page.map((e) => {
      const next = open.find(
        (m) => m.tournamentId === e.tournamentId && (m.entrantAId === e.id || m.entrantBId === e.id),
      );
      return {
        tournament: serializeTournament(e.tournament),
        entry: {
          entrantId: e.id,
          seed: e.seed,
          placement: e.placement,
          checkedIn: e.checkedInAt != null,
          wins: e.wins,
          losses: e.losses,
        },
        nextMatch: next
          ? serializeMatch(next, {
              userId,
              hostId: e.tournament.createdById,
            })
          : null,
      };
    }),
    nextCursor:
      entries.length > q.limit && last
        ? encodeTimeCursor({
            ms: last.joinedAt.getTime(),
            id: last.id,
          })
        : null,
  };
}

// ─── Writes ────────────────────────────────────────────────────────────────

export type WriteOutcome<T> =
  | {
      ok: true;
      result: T;
    }
  | ({
      ok: false;
    } & Refusal);

async function run<T>(fn: () => Promise<T>): Promise<WriteOutcome<T>> {
  try {
    return {
      ok: true,
      result: await fn(),
    };
  } catch (e) {
    if (e instanceof TournamentError)
      return {
        ok: false,
        ...refusalOf(e),
      };
    throw e;
  }
}

/** Check the key owner in (the site's `checkIn`: only their own row; repeating it is a no-op). */
export function checkInForKey(
  tournamentId: string,
  userId: string,
): Promise<
  WriteOutcome<{
    tournamentId: string;
    checkedIn: true;
  }>
> {
  return run(async () => {
    await checkIn({
      tournamentId,
      userId,
    });
    return {
      tournamentId,
      checkedIn: true as const,
    };
  });
}

interface GuardMatch {
  id: string;
  tournamentId: string;
  round: number;
  bracket: string;
  nextMatchId: string | null;
  state: string;
  claimedWinnerId: string | null;
  claimedById: string | null;
  claimedAt: Date | null;
  disputedAt: Date | null;
  entrantAId: string | null;
  entrantBId: string | null;
  entrantA: {
    userId: string;
  } | null;
  entrantB: {
    userId: string;
  } | null;
}

async function loadGuardMatch(tournamentId: string, matchId: string): Promise<GuardMatch | null> {
  const m = await prisma.tournamentMatch.findUnique({
    where: {
      id: matchId,
    },
    select: {
      id: true,
      tournamentId: true,
      round: true,
      bracket: true,
      nextMatchId: true,
      state: true,
      claimedWinnerId: true,
      claimedById: true,
      claimedAt: true,
      disputedAt: true,
      entrantAId: true,
      entrantBId: true,
      entrantA: {
        select: {
          userId: true,
        },
      },
      entrantB: {
        select: {
          userId: true,
        },
      },
    },
  });
  return m && m.tournamentId === tournamentId ? m : null;
}

/** Someone else's open claim, which the key owner's report would answer. */
const answersForeignClaim = (m: GuardMatch, userId: string): boolean =>
  m.claimedAt != null &&
  m.disputedAt == null &&
  m.claimedById !== userId &&
  (m.entrantA?.userId === userId || m.entrantB?.userId === userId);

/**
 * Report that the key owner (`me`) or their opponent won. The site's `claimResult` decides who may
 * report and when, and with `refuseIfPays` it refuses under its own lock a report that would confirm a
 * prize-deciding match (`confirm_on_site`). Refused here, before it runs: a report that would dispute
 * a reported result (disputes stay on the site; they move no coins).
 */
export async function claimForKey(
  tournamentId: string,
  matchId: string,
  userId: string,
  body: z.infer<typeof claimBody>,
): Promise<
  WriteOutcome<{
    status: string;
    settled: boolean;
    tournamentComplete: boolean;
  }>
> {
  const m = await loadGuardMatch(tournamentId, matchId);
  if (!m)
    return {
      ok: false,
      code: 'not_found',
      status: 404,
      message: 'Not found.',
    };
  const iAmA = m.entrantA?.userId === userId;
  const iAmB = m.entrantB?.userId === userId;
  const mine = iAmA ? m.entrantAId : iAmB ? m.entrantBId : null;
  const theirs = iAmA ? m.entrantBId : iAmB ? m.entrantAId : null;
  // Not a player, or no opponent yet: pass any entrant so the site function words its own refusal.
  const winnerEntrantId = (body.winner === 'me' ? mine : theirs) ?? m.entrantAId ?? m.entrantBId ?? '';
  if (answersForeignClaim(m, userId)) {
    if (winnerEntrantId !== m.claimedWinnerId) {
      return {
        ok: false,
        code: 'conflict',
        status: 409,
        message: 'A result is already reported. Confirm it, or dispute it on the site.',
      };
    }
  }
  return run(() =>
    claimResult({
      tournamentId,
      matchId,
      userId,
      winnerEntrantId,
      refuseIfPays: true,
    }),
  );
}

/** Confirm the opponent's reported result (the site's `confirmResult`); it refuses, under its lock, one that would pay a prize. */
export async function confirmForKey(
  tournamentId: string,
  matchId: string,
  userId: string,
): Promise<
  WriteOutcome<{
    settled: boolean;
    tournamentComplete: boolean;
  }>
> {
  return run(() =>
    confirmResult({
      tournamentId,
      matchId,
      userId,
      refuseIfPays: true,
    }),
  );
}

/** Take the key owner's own report back before it is answered (the site's `withdrawClaim`). */
export function withdrawForKey(
  tournamentId: string,
  matchId: string,
  userId: string,
): Promise<
  WriteOutcome<{
    withdrawn: true;
  }>
> {
  return run(async () => {
    await withdrawClaim({
      tournamentId,
      matchId,
      userId,
    });
    return {
      withdrawn: true as const,
    };
  });
}

// ─── Request helpers (the same shape as the events routes') ────────────────

export { queryOf, readInput, readBody } from './request-input';
