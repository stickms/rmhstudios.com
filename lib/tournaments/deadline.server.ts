/**
 * Stamping a match deadline (s07-06). Kept apart from `scheduling.server.ts` so
 * `tournament.server.ts` can call it without a cycle: this module imports no
 * tournament module, and `scheduling.server.ts` (which settles matches through
 * `tournament.server.ts`) re-exports it.
 *
 * Every place a match receives its second entrant calls one of these in the same
 * transaction that filled the slot (`MATCH_READY_PATHS` in `scheduling.ts` lists
 * them; `match-ready-paths.test.ts` holds the list). A stamp is a conditional
 * write on `deadlineAt: null` and a READY state, so repeating it, or two paths
 * reaching one match, stamps once; a tournament with no deadline setting stamps
 * nothing.
 */
import type { Prisma } from '@prisma/client';
import { deadlineFor } from '@/lib/tournaments/scheduling';

type Tx = Prisma.TransactionClient;

/** Stamp one match that has just become ready. Answers whether a deadline was written. */
export async function stampDeadline(tx: Tx, matchId: string, now: Date = new Date()): Promise<boolean> {
  const match = await tx.tournamentMatch.findUnique({
    where: {
      id: matchId,
    },
    select: {
      id: true,
      tournamentId: true,
    },
  });
  if (!match) return false;
  const t = await tx.tournament.findUnique({
    where: {
      id: match.tournamentId,
    },
    select: {
      matchDeadlineHours: true,
    },
  });
  const at = deadlineFor(now, t?.matchDeadlineHours);
  if (!at) return false;
  const stamped = await tx.tournamentMatch.updateMany({
    where: {
      id: match.id,
      state: 'READY',
      deadlineAt: null,
    },
    data: {
      deadlineAt: at,
    },
  });
  return stamped.count > 0;
}

/**
 * Stamp every ready match of a tournament that has no deadline yet (the bracket's
 * first round at the start, a Swiss round when it is generated). `round` narrows
 * it to one round. Answers how many matches were stamped.
 */
export async function stampTournamentDeadlines(
  tx: Tx,
  tournamentId: string,
  opts: {
    round?: number;
    now?: Date;
  } = {},
): Promise<number> {
  const t = await tx.tournament.findUnique({
    where: {
      id: tournamentId,
    },
    select: {
      matchDeadlineHours: true,
    },
  });
  const at = deadlineFor(opts.now ?? new Date(), t?.matchDeadlineHours);
  if (!at) return 0;
  const stamped = await tx.tournamentMatch.updateMany({
    where: {
      tournamentId,
      state: 'READY',
      deadlineAt: null,
      ...(opts.round != null
        ? {
            round: opts.round,
          }
        : {}),
    },
    data: {
      deadlineAt: at,
    },
  });
  return stamped.count;
}
