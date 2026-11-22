/**
 * Confirm or dispute a tournament result (s06-20). Server side of
 * `match-results.ts`.
 *
 * Every step that changes a claim (claim, confirm, dispute, withdraw, decide, the
 * job's settlement) runs in a transaction that first takes
 * `lockKey(tx, 'tournament-match:' + matchId)` and re-reads the match. Settling
 * is a conditional `updateMany` on the claim (id, claimedAt, disputedAt null,
 * state open) that consumes it: of a confirm and the job racing, one sees count
 * 1 and settles, the other sees 0 and does nothing. `settleMatch` is called
 * once, after that transaction, and is itself idempotent per match.
 */
import type { Prisma, PrismaClient, TournamentMatch } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { TournamentError } from './tournament-error';
import { settleMatch } from './tournament.server';
import {
  autoSettleDecision,
  canAnswerClaim,
  canDecide,
  canWithdrawClaim,
  claimCutoff,
  reportOutcome,
  type ClaimState,
  type CompletionInput,
} from './match-results';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export const MATCH_CLAIM_QUEUE = 'tournament-match-claims';
export const MATCH_CLAIM_CRON = '* * * * *';
/** Claims handled per job run; the rest wait for the next minute. */
const JOB_BATCH = 100;
/** At most this many claims are looked at per run, settled or not (bounds the `notIn` list). */
const JOB_SCAN_LIMIT = 500;

export type ClaimResultStatus = 'claimed' | 'confirmed' | 'disputed' | 'unchanged';

const NO_CLAIM = {
  claimedWinnerId: null,
  claimedById: null,
  claimedAt: null,
  disputedAt: null,
  disputedById: null,
  disputeNote: null,
} as const;

const OPEN_STATES = ['READY', 'LIVE'] as const;

interface Locked {
  match: TournamentMatch;
  tournament: {
    id: string;
    name: string;
    createdById: string;
    format: CompletionInput['format'];
    status: string;
    swissRounds: number | null;
  };
  /** entrant id -> user id for the match's two sides. */
  users: Map<string, string>;
}

/** Take the match lock, re-read the match and its tournament, and refuse what cannot be acted on. */
async function lockMatch(tx: Tx, tournamentId: string, matchId: string): Promise<Locked> {
  await lockKey(tx, 'tournament-match:' + matchId);
  const match = await tx.tournamentMatch.findUnique({
    where: {
      id: matchId,
    },
  });
  if (!match || match.tournamentId !== tournamentId) {
    throw new TournamentError('Match not found', 'NOT_FOUND', 404);
  }
  const tournament = await tx.tournament.findUnique({
    where: {
      id: tournamentId,
    },
    select: {
      id: true,
      name: true,
      createdById: true,
      format: true,
      status: true,
      swissRounds: true,
    },
  });
  if (!tournament) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
  const ids = [match.entrantAId, match.entrantBId].filter(Boolean) as string[];
  const entrants = ids.length
    ? await tx.tournamentEntrant.findMany({
        where: {
          id: {
            in: ids,
          },
        },
        select: {
          id: true,
          userId: true,
        },
      })
    : [];
  return {
    match,
    tournament,
    users: new Map(entrants.map((e) => [e.id, e.userId])),
  };
}

function assertOpen({ match, tournament }: Locked): void {
  if (match.state === 'CANCELLED') {
    throw new TournamentError('This match was cancelled with its tournament', 'MATCH_CANCELLED', 409);
  }
  if (tournament.status !== 'LIVE') throw new TournamentError('Tournament is not live', 'NOT_LIVE', 409);
  if (!OPEN_STATES.includes(match.state as (typeof OPEN_STATES)[number]) || !match.entrantAId || !match.entrantBId) {
    throw new TournamentError('Match is not ready', 'NOT_READY', 409);
  }
}

const claimState = (m: TournamentMatch): ClaimState => ({
  claimedWinnerId: m.claimedWinnerId,
  claimedById: m.claimedById,
  claimedAt: m.claimedAt,
  disputedAt: m.disputedAt,
});

const participants = (l: Locked): string[] => [...l.users.values()];

function link(tournamentId: string): string {
  return `/tournaments/${tournamentId}`;
}

/** Best-effort notice (label `tournament_result`); a failed notice never fails the step. */
async function notify(userIds: (string | null | undefined)[], tournamentId: string, preview: string, actorId?: string) {
  const unique = [...new Set(userIds.filter((u): u is string => !!u))];
  await Promise.allSettled(
    unique.map((userId) =>
      createNotification({
        userId,
        type: 'SYSTEM',
        entityType: 'tournament_result',
        entityId: tournamentId,
        preview,
        link: link(tournamentId),
        ...(actorId
          ? {
              actorId,
            }
          : {}),
      }),
    ),
  );
}

type Settlement = {
  settled: boolean;
  tournamentComplete: boolean;
};
/** What to run after the lock transaction commits; null when the claim was already consumed. */
type Pending = (() => Promise<Settlement>) | null;

/**
 * Consume the claim (CAS on id + claimedAt + not disputed + open state). The
 * caller runs the returned function after its transaction commits: it settles
 * once, and puts the claim back if `settleMatch` throws.
 */
async function consumeClaim(db: Db, tx: Tx, l: Locked, source: string, winnerEntrantId: string): Promise<Pending> {
  const { match } = l;
  const cas = await tx.tournamentMatch.updateMany({
    where: {
      id: match.id,
      claimedAt: match.claimedAt,
      disputedAt: null,
      state: {
        in: [...OPEN_STATES],
      },
    },
    data: {
      ...NO_CLAIM,
    },
  });
  if (cas.count === 0) return null;
  return async () => {
    try {
      return await settleMatch(
        {
          tournamentId: match.tournamentId,
          matchId: match.id,
          winnerEntrantId,
          source,
        },
        db,
      );
    } catch (error) {
      await db.tournamentMatch.updateMany({
        where: {
          id: match.id,
          claimedAt: null,
          state: {
            in: [...OPEN_STATES],
          },
        },
        data: {
          claimedWinnerId: match.claimedWinnerId,
          claimedById: match.claimedById,
          claimedAt: match.claimedAt,
        },
      });
      throw error;
    }
  };
}

async function finish(p: Pending): Promise<Settlement> {
  return p
    ? p()
    : {
        settled: false,
        tournamentComplete: false,
      };
}

// ─── Claim ──────────────────────────────────────────────────────────────────

/**
 * A participant reports a winner. No claim yet: it becomes one. The opponent's
 * report of the same winner confirms it and of the other winner disputes it.
 */
export async function claimResult(
  opts: {
    tournamentId: string;
    matchId: string;
    userId: string;
    winnerEntrantId: string;
  },
  db: Db = prisma,
): Promise<{
  status: ClaimResultStatus;
  settled: boolean;
  tournamentComplete: boolean;
}> {
  type Step =
    | {
        kind: 'done';
        status: ClaimResultStatus;
        locked: Locked;
      }
    | {
        kind: 'settle';
        pending: Pending;
        locked: Locked;
        claimantId: string | null;
      };
  const step: Step = await db.$transaction(async (tx) => {
    const l = await lockMatch(tx, opts.tournamentId, opts.matchId);
    assertOpen(l);
    const { match } = l;
    if (!participants(l).includes(opts.userId)) {
      throw new TournamentError('Not your match', 'FORBIDDEN', 403);
    }
    if (![match.entrantAId, match.entrantBId].includes(opts.winnerEntrantId)) {
      throw new TournamentError('Winner must be in this match', 'BAD_WINNER', 400);
    }
    const outcome = reportOutcome(claimState(match), opts.userId, opts.winnerEntrantId);
    if (outcome === 'locked') {
      throw new TournamentError('This result is disputed; the host decides it', 'DISPUTED', 409);
    }
    if (outcome === 'unchanged')
      return {
        kind: 'done',
        status: 'unchanged',
        locked: l,
      };
    if (outcome === 'claim' || outcome === 'replace') {
      await tx.tournamentMatch.update({
        where: {
          id: match.id,
        },
        data: {
          claimedWinnerId: opts.winnerEntrantId,
          claimedById: opts.userId,
          claimedAt: new Date(),
        },
      });
      return {
        kind: 'done',
        status: 'claimed',
        locked: l,
      };
    }
    if (outcome === 'dispute') {
      await tx.tournamentMatch.update({
        where: {
          id: match.id,
        },
        data: {
          disputedAt: new Date(),
          disputedById: opts.userId,
        },
      });
      return {
        kind: 'done',
        status: 'disputed',
        locked: l,
      };
    }
    // confirm: the opponent reported the claimed winner.
    const pending = await consumeClaim(db, tx, l, 'agreement', match.claimedWinnerId!);
    return {
      kind: 'settle',
      pending,
      locked: l,
      claimantId: match.claimedById,
    };
  });

  if (step.kind === 'settle') {
    const res = await finish(step.pending);
    return {
      status: 'confirmed',
      ...res,
    };
  }
  const { match, tournament } = step.locked;
  if (step.status === 'claimed') {
    const opponent = participants(step.locked).filter((u) => u !== opts.userId);
    await notify(
      opponent,
      tournament.id,
      `A result was reported in ${tournament.name}: confirm or dispute it`,
      opts.userId,
    );
  } else if (step.status === 'disputed') {
    await notify(
      [match.claimedById, tournament.createdById],
      tournament.id,
      `A result was disputed in ${tournament.name}`,
      opts.userId,
    );
  }
  return {
    status: step.status,
    settled: false,
    tournamentComplete: false,
  };
}

// ─── Confirm / dispute / withdraw ───────────────────────────────────────────

export async function confirmResult(
  opts: {
    tournamentId: string;
    matchId: string;
    userId: string;
  },
  db: Db = prisma,
): Promise<{
  settled: boolean;
  tournamentComplete: boolean;
}> {
  const out = await db.$transaction(async (tx) => {
    const l = await lockMatch(tx, opts.tournamentId, opts.matchId);
    assertOpen(l);
    const state = claimState(l.match);
    if (!state.claimedAt) throw new TournamentError('There is no result to confirm', 'NO_CLAIM', 409);
    if (state.disputedAt) throw new TournamentError('This result is disputed; the host decides it', 'DISPUTED', 409);
    if (!participants(l).includes(opts.userId)) throw new TournamentError('Not your match', 'FORBIDDEN', 403);
    if (!canAnswerClaim(state, opts.userId, participants(l))) {
      throw new TournamentError('You cannot confirm your own report', 'OWN_CLAIM', 403);
    }
    return {
      pending: await consumeClaim(db, tx, l, 'agreement', state.claimedWinnerId!),
      l,
    };
  });
  return finish(out.pending);
}

export async function disputeResult(
  opts: {
    tournamentId: string;
    matchId: string;
    userId: string;
    note?: string;
  },
  db: Db = prisma,
): Promise<void> {
  const l = await db.$transaction(async (tx) => {
    const locked = await lockMatch(tx, opts.tournamentId, opts.matchId);
    assertOpen(locked);
    const state = claimState(locked.match);
    if (!state.claimedAt) throw new TournamentError('There is no result to dispute', 'NO_CLAIM', 409);
    if (state.disputedAt) throw new TournamentError('This result is already disputed', 'DISPUTED', 409);
    if (!participants(locked).includes(opts.userId)) throw new TournamentError('Not your match', 'FORBIDDEN', 403);
    if (!canAnswerClaim(state, opts.userId, participants(locked))) {
      throw new TournamentError('You cannot dispute your own report', 'OWN_CLAIM', 403);
    }
    const cas = await tx.tournamentMatch.updateMany({
      where: {
        id: locked.match.id,
        claimedAt: state.claimedAt,
        disputedAt: null,
        state: {
          in: [...OPEN_STATES],
        },
      },
      data: {
        disputedAt: new Date(),
        disputedById: opts.userId,
        disputeNote: opts.note ? opts.note.slice(0, 300) : null,
      },
    });
    if (cas.count === 0) throw new TournamentError('This result was already answered', 'CLAIM_GONE', 409);
    return locked;
  });
  await notify(
    [l.match.claimedById, l.tournament.createdById],
    l.tournament.id,
    `A result was disputed in ${l.tournament.name}`,
    opts.userId,
  );
}

export async function withdrawClaim(
  opts: {
    tournamentId: string;
    matchId: string;
    userId: string;
  },
  db: Db = prisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const l = await lockMatch(tx, opts.tournamentId, opts.matchId);
    assertOpen(l);
    const state = claimState(l.match);
    if (!state.claimedAt) throw new TournamentError('There is no result to withdraw', 'NO_CLAIM', 409);
    if (!canWithdrawClaim(state, opts.userId)) {
      throw new TournamentError('Only the person who reported can withdraw, before it is answered', 'FORBIDDEN', 403);
    }
    const cas = await tx.tournamentMatch.updateMany({
      where: {
        id: l.match.id,
        claimedAt: state.claimedAt,
        disputedAt: null,
      },
      data: {
        ...NO_CLAIM,
      },
    });
    if (cas.count === 0) throw new TournamentError('This result was already answered', 'CLAIM_GONE', 409);
  });
}

// ─── Host decision ──────────────────────────────────────────────────────────

/** The host or an admin decides a claim or dispute: settles at once with source `admin`. */
export async function decideDispute(
  opts: {
    tournamentId: string;
    matchId: string;
    byUserId: string;
    isAdmin?: boolean;
    winnerEntrantId: string;
    note?: string;
  },
  db: Db = prisma,
): Promise<{
  settled: boolean;
  tournamentComplete: boolean;
}> {
  const out = await db.$transaction(async (tx) => {
    const l = await lockMatch(tx, opts.tournamentId, opts.matchId);
    assertOpen(l);
    const isHost = l.tournament.createdById === opts.byUserId;
    if (!canDecide(isHost, !!opts.isAdmin)) throw new TournamentError('Only the host can decide', 'FORBIDDEN', 403);
    const { match } = l;
    if (!match.claimedAt) throw new TournamentError('There is no claim to decide', 'NO_CLAIM', 409);
    if (![match.entrantAId, match.entrantBId].includes(opts.winnerEntrantId)) {
      throw new TournamentError('Winner must be in this match', 'BAD_WINNER', 400);
    }
    // Consume the claim whether or not it was disputed: a decision overrides both.
    const cas = await tx.tournamentMatch.updateMany({
      where: {
        id: match.id,
        claimedAt: match.claimedAt,
        state: {
          in: [...OPEN_STATES],
        },
      },
      data: {
        ...NO_CLAIM,
      },
    });
    if (cas.count === 0) throw new TournamentError('This result was already settled', 'CLAIM_GONE', 409);
    return l;
  });
  const { match, tournament } = out;
  let res: {
    settled: boolean;
    tournamentComplete: boolean;
  };
  try {
    res = await settleMatch(
      {
        tournamentId: tournament.id,
        matchId: match.id,
        winnerEntrantId: opts.winnerEntrantId,
        source: 'admin',
      },
      db,
    );
  } catch (error) {
    await db.tournamentMatch.updateMany({
      where: {
        id: match.id,
        claimedAt: null,
        state: {
          in: [...OPEN_STATES],
        },
      },
      data: {
        claimedWinnerId: match.claimedWinnerId,
        claimedById: match.claimedById,
        claimedAt: match.claimedAt,
        disputedAt: match.disputedAt,
        disputedById: match.disputedById,
        disputeNote: match.disputeNote,
      },
    });
    throw error;
  }
  // settleMatch runs its own transaction, so the audit row follows the settlement (best-effort, never throws).
  await logAdminAction(opts.byUserId, 'tournament.match.decide', {
    targetType: 'TournamentMatch',
    targetId: match.id,
    detail: `tournament:${tournament.id} winner:${opts.winnerEntrantId}${opts.isAdmin ? ' admin' : ' host'}`,
  });
  await notify(participants(out), tournament.id, `The host decided a result in ${tournament.name}`, opts.byUserId);
  return res;
}

/**
 * A host's or admin's direct report, or a game hub's authoritative result, just
 * settled the match: any claim on it is cleared, and the players hear about it if
 * there was one to overrule. Best-effort; the settlement already happened.
 */
export async function clearClaimAfterSettle(
  matchId: string,
  opts: {
    notify: boolean;
    actorId?: string;
  },
  db: Db = prisma,
): Promise<void> {
  const before = await db.tournamentMatch.findUnique({
    where: {
      id: matchId,
    },
  });
  if (!before?.claimedAt) return;
  await db.tournamentMatch.updateMany({
    where: {
      id: matchId,
      claimedAt: {
        not: null,
      },
    },
    data: {
      ...NO_CLAIM,
    },
  });
  if (!opts.notify) return;
  const [tournament, entrants] = await Promise.all([
    db.tournament.findUnique({
      where: {
        id: before.tournamentId,
      },
      select: {
        id: true,
        name: true,
      },
    }),
    db.tournamentEntrant.findMany({
      where: {
        id: {
          in: [before.entrantAId, before.entrantBId].filter(Boolean) as string[],
        },
      },
      select: {
        userId: true,
      },
    }),
  ]);
  if (!tournament) return;
  await notify(
    entrants.map((e) => e.userId),
    tournament.id,
    `The host decided a result in ${tournament.name}`,
    opts.actorId,
  );
}

// ─── The per-minute job ─────────────────────────────────────────────────────

async function completionInput(tx: Tx, l: Locked): Promise<CompletionInput> {
  const { match, tournament } = l;
  let otherOpenMatches = 0;
  if (tournament.format === 'ROUND_ROBIN') {
    otherOpenMatches = await tx.tournamentMatch.count({
      where: {
        tournamentId: tournament.id,
        id: {
          not: match.id,
        },
        state: {
          not: 'COMPLETE',
        },
      },
    });
  } else if (tournament.format === 'SWISS') {
    otherOpenMatches = await tx.tournamentMatch.count({
      where: {
        tournamentId: tournament.id,
        round: match.round,
        id: {
          not: match.id,
        },
        state: {
          not: 'COMPLETE',
        },
      },
    });
  }
  return {
    format: tournament.format,
    bracket: match.bracket,
    round: match.round,
    hasNextMatch: match.nextMatchId != null,
    swissRounds: tournament.swissRounds,
    otherOpenMatches,
  };
}

/**
 * Settle every claim the opponent left unanswered past the window, except one
 * whose settlement would complete the tournament (payouts): those wait for the
 * opponent or the host. Returns how many matches it settled.
 */
export async function settleUnansweredClaims(db: Db = prisma, now: Date = new Date()): Promise<number> {
  const tried: string[] = [];
  let settled = 0;
  const settleOne = async (row: { id: string; tournamentId: string }): Promise<boolean> => {
    try {
      const out = await db.$transaction(async (tx) => {
        const l = await lockMatch(tx, row.tournamentId, row.id);
        if (l.tournament.status !== 'LIVE') return null;
        const decision = autoSettleDecision(claimState(l.match), await completionInput(tx, l), now);
        if (decision !== 'settle') return null;
        return {
          l,
          pending: await consumeClaim(db, tx, l, 'unanswered', l.match.claimedWinnerId!),
        };
      });
      if (!out) return false;
      const res = await finish(out.pending);
      if (!res.settled) return false;
      await notify(
        participants(out.l),
        out.l.tournament.id,
        `A result in ${out.l.tournament.name} was settled: it was not answered in time`,
      );
      return true;
    } catch {
      // One bad match never stops the rest; the claim stays and the next run retries it.
      return false;
    }
  };
  while (settled < JOB_BATCH && tried.length < JOB_SCAN_LIMIT) {
    const due = await db.tournamentMatch.findMany({
      where: {
        claimedAt: {
          lte: claimCutoff(now),
          not: null,
        },
        disputedAt: null,
        // Rows this run already tried (settled, prize-deciding or failed) are paged past,
        // so claims that must wait for a person never starve the ones behind them.
        ...(tried.length
          ? {
              id: {
                notIn: [...tried],
              },
            }
          : {}),
        tournament: {
          status: 'LIVE',
        },
        state: {
          in: [...OPEN_STATES],
        },
      },
      orderBy: {
        claimedAt: 'asc',
      },
      take: JOB_BATCH,
      select: {
        id: true,
        tournamentId: true,
      },
    });
    if (due.length === 0) break;
    for (const row of due) {
      tried.push(row.id);
      if (await settleOne(row)) settled += 1;
    }
  }
  return settled;
}

/** Registered once from server/jobs/index.ts; only the worker's boss instance schedules. */
export async function registerMatchClaimCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(MATCH_CLAIM_QUEUE);
  await boss.schedule(
    MATCH_CLAIM_QUEUE,
    MATCH_CLAIM_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(MATCH_CLAIM_QUEUE, async () => {
    await settleUnansweredClaims();
  });
}

// ─── Erasure and export ─────────────────────────────────────────────────────

/** Match rows are tournament records and stay; where the member was the actor the reference (and their note) goes. */
export function matchResultErasureOps(userId: string) {
  return [
    prisma.tournamentMatch.updateMany({
      where: {
        claimedById: userId,
      },
      data: {
        claimedById: null,
      },
    }),
    prisma.tournamentMatch.updateMany({
      where: {
        disputedById: userId,
      },
      data: {
        disputedById: null,
        disputeNote: null,
      },
    }),
  ];
}

/** The results the member claimed or disputed, for the account export. */
export async function exportMatchResults(userId: string) {
  const rows = await prisma.tournamentMatch.findMany({
    where: {
      OR: [
        {
          claimedById: userId,
        },
        {
          disputedById: userId,
        },
      ],
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 1000,
    select: {
      id: true,
      tournamentId: true,
      claimedById: true,
      claimedAt: true,
      disputedById: true,
      disputedAt: true,
      disputeNote: true,
    },
  });
  return rows.map((r) => ({
    matchId: r.id,
    tournamentId: r.tournamentId,
    claimedAt: r.claimedById === userId ? r.claimedAt : null,
    disputedAt: r.disputedById === userId ? r.disputedAt : null,
    disputeNote: r.disputedById === userId ? r.disputeNote : null,
  }));
}
