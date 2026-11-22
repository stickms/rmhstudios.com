/**
 * Reporting entry points: a participant's claim (match-results.server) or a host's,
 * admin's or hub's direct settlement (tournament.server). They sit in their own module
 * so tournament.server and match-results.server depend one way only
 * (match-results -> tournament); neither imports this file.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { TournamentError } from './tournament-error';
import { matchCancelledError, settleMatch } from './tournament.server';
import { claimResult, clearClaimAfterSettle, type ClaimResultStatus } from './match-results.server';

type Db = PrismaClient;

/** Host/admin (or a participant) reports a match winner. */
export async function reportMatch(
  opts: {
    tournamentId: string;
    matchId: string;
    winnerEntrantId: string;
    reporterId: string;
    isAdmin?: boolean;
  },
  db: Db = prisma,
): Promise<{
  settled: boolean;
  tournamentComplete: boolean;
  claim?: ClaimResultStatus;
}> {
  const t = await db.tournament.findUnique({
    where: {
      id: opts.tournamentId,
    },
  });
  if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);

  const match = await db.tournamentMatch.findUnique({
    where: {
      id: opts.matchId,
    },
  });
  if (!match || match.tournamentId !== t.id) {
    throw new TournamentError('Match not found', 'NOT_FOUND', 404);
  }
  // Checked before the tournament status so the reporter learns WHY: the match
  // was closed by the tournament's cancellation, not merely "not live".
  if (match.state === 'CANCELLED') throw matchCancelledError();
  if (t.status !== 'LIVE') throw new TournamentError('Tournament is not live', 'NOT_LIVE', 409);

  // Authorization: host or admin may report any match; a participant may report
  // only their own match.
  const isHost = t.createdById === opts.reporterId || opts.isAdmin;
  if (!isHost) {
    const entrants = await db.tournamentEntrant.findMany({
      where: {
        id: {
          in: [match.entrantAId, match.entrantBId].filter(Boolean) as string[],
        },
      },
      select: {
        userId: true,
      },
    });
    const isParticipant = entrants.some((e) => e.userId === opts.reporterId);
    if (!isParticipant) throw new TournamentError('Not your match', 'FORBIDDEN', 403);
  }
  if (match.state !== 'READY' && match.state !== 'LIVE') {
    throw new TournamentError('Match is not ready', 'NOT_READY', 409);
  }
  // A participant's report is a claim the opponent confirms or disputes (s06-20); only a host's
  // or an admin's report settles at once.
  if (!isHost) {
    const { status, settled, tournamentComplete } = await claimResult(
      {
        tournamentId: t.id,
        matchId: opts.matchId,
        userId: opts.reporterId,
        winnerEntrantId: opts.winnerEntrantId,
      },
      db,
    );
    return {
      settled,
      tournamentComplete,
      claim: status,
    };
  }
  const res = await settleMatch(
    {
      tournamentId: t.id,
      matchId: opts.matchId,
      winnerEntrantId: opts.winnerEntrantId,
      source: 'admin',
    },
    db,
  );
  if (res.settled) {
    await clearClaimAfterSettle(
      opts.matchId,
      {
        notify: true,
        actorId: opts.reporterId,
      },
      db,
    ).catch(() => undefined);
  }
  return res;
}

/** Authoritative report from a game hub (via /api/internal/match-result). */
export async function reportTournamentMatchByGameSession(
  opts: {
    gameSessionRef: string;
    winnerId: string;
  },
  db: Db = prisma,
): Promise<{
  settled: boolean;
}> {
  const match = await db.tournamentMatch.findFirst({
    where: {
      gameSessionRef: opts.gameSessionRef,
      state: {
        in: ['READY', 'LIVE'],
      },
    },
  });
  if (!match)
    return {
      settled: false,
    };
  // Map the winning userId to its entrant in this match.
  const entrants = await db.tournamentEntrant.findMany({
    where: {
      id: {
        in: [match.entrantAId, match.entrantBId].filter(Boolean) as string[],
      },
    },
  });
  const winnerEntrant = entrants.find((e) => e.userId === opts.winnerId);
  if (!winnerEntrant)
    return {
      settled: false,
    };
  const res = await settleMatch(
    {
      tournamentId: match.tournamentId,
      matchId: match.id,
      winnerEntrantId: winnerEntrant.id,
      source: 'authoritative',
    },
    db,
  );
  // A hub's result overrules any claim on the match.
  if (res.settled)
    await clearClaimAfterSettle(
      match.id,
      {
        notify: true,
      },
      db,
    ).catch(() => undefined);
  return {
    settled: res.settled,
  };
}
