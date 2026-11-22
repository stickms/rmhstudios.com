/**
 * Match times and deadlines in tournaments (s07-06), the write side.
 *
 * Propose, accept, the host's set and the award each run in a transaction that
 * first takes `lockKey(tx, 'tournament-match:' + matchId)` (the key the result
 * claims in `match-results.server.ts` take, so an award and a claim on one match
 * serialise) and re-read the match. The deadline setting takes
 * `lockKey(tx, 'tournament:' + id)`, check-in's key. Reminders are claimed by a
 * conditional `updateMany` on their own column before anyone is notified, so two
 * overlapping cron runs notify once.
 *
 * Import direction: this module imports `tournament.server` (for `settleMatch`)
 * and `match-results.server`; `tournament.server` imports only
 * `deadline.server`, never this module (the import-cycle ratchet).
 */
import type {
  Prisma,
  PrismaClient,
  TournamentMatch,
} from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { TournamentError } from './tournament-error';
import { settleMatch } from './tournament.server';
import { clearClaimAfterSettle } from './match-results.server';
import {
  PROPOSAL_MESSAGES,
  REMIND_BEFORE_MINUTES,
  DEADLINE_NOTICE_HOURS,
  canAward,
  isDeadlineHours,
  isSchedulable,
  proposalProblem,
} from './scheduling';

export {
  stampDeadline,
  stampTournamentDeadlines,
} from './deadline.server';

type Db =
  PrismaClient;
type Tx =
  Prisma.TransactionClient;

export const MATCH_SCHEDULE_QUEUE =
  'tournament-match-schedule';
export const MATCH_SCHEDULE_CRON =
  '* * * * *';
/** Matches one notice run claims per kind; the next minute's run takes the rest. */
export const SCHEDULE_NOTICE_BATCH = 100;

const OPEN_STATES =
  [
    'READY',
    'LIVE',
  ] as const;

interface Locked {
  match: TournamentMatch;
  tournament: {
    id: string;
    name: string;
    createdById: string;
    status: string;
  };
  /** entrant id -> user id for the match's two sides. */
  users: Map<
    string,
    string
  >;
}

/** Take the match lock, re-read the match and its tournament, and refuse what cannot be acted on. */
async function lockMatch(
  tx: Tx,
  tournamentId: string,
  matchId: string,
): Promise<Locked> {
  await lockKey(
    tx,
    'tournament-match:' +
      matchId,
  );
  const match =
    await tx.tournamentMatch.findUnique(
      {
        where:
          {
            id: matchId,
          },
      },
    );
  if (
    !match ||
    match.tournamentId !==
      tournamentId
  ) {
    throw new TournamentError(
      'Match not found',
      'NOT_FOUND',
      404,
    );
  }
  const tournament =
    await tx.tournament.findUnique(
      {
        where:
          {
            id: tournamentId,
          },
        select:
          {
            id: true,
            name: true,
            createdById: true,
            status: true,
          },
      },
    );
  if (
    !tournament
  )
    throw new TournamentError(
      'Tournament not found',
      'NOT_FOUND',
      404,
    );
  const ids =
    [
      match.entrantAId,
      match.entrantBId,
    ].filter(
      (
        id,
      ): id is string =>
        !!id,
    );
  const entrants =
    ids.length
      ? await tx.tournamentEntrant.findMany(
          {
            where:
              {
                id: {
                  in: ids,
                },
              },
            select:
              {
                id: true,
                userId: true,
              },
          },
        )
      : [];
  return {
    match,
    tournament,
    users:
      new Map(
        Array.isArray(
          entrants,
        )
          ? entrants.map(
              (
                e,
              ) => [
                e.id,
                e.userId,
              ],
            )
          : [],
      ),
  };
}

function assertOpen({
  match,
  tournament,
}: Locked): void {
  if (
    match.state ===
    'CANCELLED'
  ) {
    throw new TournamentError(
      'This match was cancelled with its tournament',
      'MATCH_CANCELLED',
      409,
    );
  }
  if (
    tournament.status !==
    'LIVE'
  ) {
    throw new TournamentError(
      'Tournament is not live',
      'NOT_LIVE',
      409,
    );
  }
  if (
    !isSchedulable(
      match,
    )
  ) {
    throw new TournamentError(
      'Match is not ready',
      'NOT_READY',
      409,
    );
  }
}

function assertEntrant(
  l: Locked,
  userId: string,
): void {
  if (
    ![
      ...l.users.values(),
    ].includes(
      userId,
    )
  ) {
    throw new TournamentError(
      'Only the two players can do this',
      'FORBIDDEN',
      403,
    );
  }
}

function assertHost(
  l: Locked,
  opts: {
    byUserId: string;
    isAdmin?: boolean;
  },
): void {
  if (
    l
      .tournament
      .createdById !==
      opts.byUserId &&
    !opts.isAdmin
  ) {
    throw new TournamentError(
      'Only the host can do this',
      'FORBIDDEN',
      403,
    );
  }
}

function link(
  tournamentId: string,
): string {
  return `/tournaments/${tournamentId}`;
}

/** Best-effort system notices; a failed notice never fails the step. */
async function notify(
  userIds: readonly (
    | string
    | null
    | undefined
  )[],
  entityType: string,
  tournamentId: string,
  preview: string,
  actorId?: string,
): Promise<void> {
  const unique =
    [
      ...new Set(
        userIds.filter(
          (
            u,
          ): u is string =>
            !!u,
        ),
      ),
    ];
  await Promise.allSettled(
    unique.map(
      (
        userId,
      ) =>
        createNotification(
          {
            userId,
            type: 'SYSTEM',
            entityType,
            entityId:
              tournamentId,
            preview,
            link: link(
              tournamentId,
            ),
            ...(actorId
              ? {
                  actorId,
                }
              : {}),
          },
        ),
    ),
  );
}

async function blockedEitherWay(
  db:
    | Db
    | Tx,
  a: string,
  b: string,
): Promise<boolean> {
  const row =
    await db.userBlock.findFirst(
      {
        where:
          {
            OR: [
              {
                blockerId:
                  a,
                blockedId:
                  b,
              },
              {
                blockerId:
                  b,
                blockedId:
                  a,
              },
            ],
          },
        select:
          {
            id: true,
          },
      },
    );
  return !!row;
}

// ─── Deadline setting ───────────────────────────────────────────────────────

/**
 * The host (or an admin) sets how long each match has once it is ready; null
 * turns deadlines off. Allowed until the tournament completes; a change applies to
 * matches that become ready afterwards (existing deadlines stay).
 */
export async function updateDeadlineSettings(
  opts: {
    tournamentId: string;
    byUserId: string;
    isAdmin?: boolean;
    matchDeadlineHours:
      | number
      | null;
  },
  db: Db = prisma,
): Promise<void> {
  if (
    opts.matchDeadlineHours !=
      null &&
    !isDeadlineHours(
      opts.matchDeadlineHours,
    )
  ) {
    throw new TournamentError(
      'Pick a listed match deadline',
      'BAD_DEADLINE',
      400,
    );
  }
  await db.$transaction(
    async (
      tx,
    ) => {
      await lockKey(
        tx,
        `tournament:${opts.tournamentId}`,
      );
      const t =
        await tx.tournament.findUnique(
          {
            where:
              {
                id: opts.tournamentId,
              },
            select:
              {
                id: true,
                createdById: true,
                status: true,
              },
          },
        );
      if (
        !t
      )
        throw new TournamentError(
          'Tournament not found',
          'NOT_FOUND',
          404,
        );
      if (
        t.createdById !==
          opts.byUserId &&
        !opts.isAdmin
      ) {
        throw new TournamentError(
          'Only the host can do this',
          'FORBIDDEN',
          403,
        );
      }
      if (
        t.status !==
          'REGISTRATION' &&
        t.status !==
          'LIVE'
      ) {
        throw new TournamentError(
          'This tournament is over',
          'CLOSED',
          409,
        );
      }
      await tx.tournament.update(
        {
          where:
            {
              id: t.id,
            },
          data: {
            matchDeadlineHours:
              opts.matchDeadlineHours,
          },
        },
      );
    },
  );
}

// ─── Propose and accept ─────────────────────────────────────────────────────

/** One of the two players proposes a time; it replaces any live proposal. */
export async function proposeTime(
  opts: {
    tournamentId: string;
    matchId: string;
    userId: string;
    at: Date;
  },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<void> {
  const out =
    await db.$transaction(
      async (
        tx,
      ) => {
        const l =
          await lockMatch(
            tx,
            opts.tournamentId,
            opts.matchId,
          );
        assertOpen(
          l,
        );
        assertEntrant(
          l,
          opts.userId,
        );
        const me =
          await tx.user.findUnique(
            {
              where:
                {
                  id: opts.userId,
                },
              select:
                {
                  bannedUntil: true,
                },
            },
          );
        if (
          me?.bannedUntil &&
          me.bannedUntil.getTime() >
            now.getTime()
        ) {
          throw new TournamentError(
            'Your account is restricted',
            'BANNED',
            403,
          );
        }
        const problem =
          proposalProblem(
            opts.at,
            now,
            l
              .match
              .deadlineAt,
          );
        if (
          problem
        )
          throw new TournamentError(
            PROPOSAL_MESSAGES[
              problem
            ],
            problem,
            400,
          );
        await tx.tournamentMatch.update(
          {
            where:
              {
                id: l
                  .match
                  .id,
              },
            data: {
              proposedAt:
                opts.at,
              proposedById:
                opts.userId,
            },
          },
        );
        const opponent =
          [
            ...l.users.values(),
          ].find(
            (
              u,
            ) =>
              u !==
              opts.userId,
          ) ??
          null;
        // A proposal from (or to) someone the opponent blocked is delivered without a notice; the row still shows it.
        const quiet =
          opponent
            ? await blockedEitherWay(
                tx,
                opts.userId,
                opponent,
              )
            : true;
        return {
          l,
          opponent,
          quiet,
        };
      },
    );
  if (
    out.opponent &&
    !out.quiet
  ) {
    await notify(
      [
        out.opponent,
      ],
      'match-proposal',
      opts.tournamentId,
      `Your opponent proposed a time for your ${out.l.tournament.name} match`,
      opts.userId,
    );
  }
}

/** The opponent accepts the live proposal: it becomes the match's time. */
export async function acceptTime(
  opts: {
    tournamentId: string;
    matchId: string;
    userId: string;
    proposedAt: Date;
  },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<{
  scheduledAt: Date;
}> {
  const out =
    await db.$transaction(
      async (
        tx,
      ) => {
        const l =
          await lockMatch(
            tx,
            opts.tournamentId,
            opts.matchId,
          );
        assertOpen(
          l,
        );
        assertEntrant(
          l,
          opts.userId,
        );
        const {
          match,
        } =
          l;
        if (
          !match.proposedAt ||
          match.proposedAt.getTime() !==
            opts.proposedAt.getTime()
        ) {
          throw new TournamentError(
            'The proposal changed',
            'PROPOSAL_CHANGED',
            409,
          );
        }
        if (
          match.proposedById ===
          opts.userId
        ) {
          throw new TournamentError(
            'Your opponent has to accept your proposal',
            'OWN_PROPOSAL',
            403,
          );
        }
        const problem =
          proposalProblem(
            match.proposedAt,
            now,
            match.deadlineAt,
          );
        if (
          problem
        ) {
          throw new TournamentError(
            'The proposed time has passed',
            'PROPOSAL_EXPIRED',
            409,
          );
        }
        const agreed =
          match.proposedAt;
        await tx.tournamentMatch.update(
          {
            where:
              {
                id: match.id,
              },
            data: {
              scheduledAt:
                agreed,
              proposedAt:
                null,
              proposedById:
                null,
              // A new time earns a new reminder.
              remindedAt:
                null,
              agreedNoticeAt:
                now,
            },
          },
        );
        return {
          l,
          agreed,
        };
      },
    );
  await notify(
    [
      ...out.l.users.values(),
    ],
    'match-agreed',
    opts.tournamentId,
    `A time is agreed for your ${out.l.tournament.name} match`,
    opts.userId,
  );
  return {
    scheduledAt:
      out.agreed,
  };
}

/** The host (or an admin) sets the time directly, or clears it with null. */
export async function setTimeAsHost(
  opts: {
    tournamentId: string;
    matchId: string;
    byUserId: string;
    isAdmin?: boolean;
    at: Date | null;
  },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<void> {
  const l =
    await db.$transaction(
      async (
        tx,
      ) => {
        const l =
          await lockMatch(
            tx,
            opts.tournamentId,
            opts.matchId,
          );
        assertHost(
          l,
          opts,
        );
        assertOpen(
          l,
        );
        if (
          opts.at
        ) {
          const problem =
            proposalProblem(
              opts.at,
              now,
              l
                .match
                .deadlineAt,
            );
          if (
            problem
          )
            throw new TournamentError(
              PROPOSAL_MESSAGES[
                problem
              ],
              problem,
              400,
            );
        }
        await tx.tournamentMatch.update(
          {
            where:
              {
                id: l
                  .match
                  .id,
              },
            data: {
              scheduledAt:
                opts.at,
              proposedAt:
                null,
              proposedById:
                null,
              remindedAt:
                null,
              agreedNoticeAt:
                opts.at
                  ? now
                  : null,
            },
          },
        );
        return l;
      },
    );
  if (
    opts.at
  ) {
    await notify(
      [
        ...l.users.values(),
      ],
      'match-agreed',
      opts.tournamentId,
      `The host set a time for your ${l.tournament.name} match`,
      opts.byUserId,
    );
  }
}

// ─── Award ──────────────────────────────────────────────────────────────────

/**
 * The host (or an admin) awards an overdue match to one of its two entrants. Only
 * after the deadline, only with no open result claim (a claim or a dispute is
 * answered or decided first), and never by itself: it settles through
 * `settleMatch` with source `walkover`, so advancement, double-elimination drops
 * and payouts are the existing code. The audit row is written inside the
 * settling transaction.
 */
export async function awardWalkover(
  opts: {
    tournamentId: string;
    matchId: string;
    byUserId: string;
    isAdmin?: boolean;
    winnerEntrantId: string;
  },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<{
  settled: boolean;
  tournamentComplete: boolean;
}> {
  const l =
    await db.$transaction(
      async (
        tx,
      ) => {
        const l =
          await lockMatch(
            tx,
            opts.tournamentId,
            opts.matchId,
          );
        assertHost(
          l,
          opts,
        );
        assertOpen(
          l,
        );
        const {
          match,
        } =
          l;
        if (
          match.claimedAt
        ) {
          throw new TournamentError(
            'A result has been reported; confirm, dispute or decide it first',
            'OPEN_CLAIM',
            409,
          );
        }
        if (
          !canAward(
            match,
            now,
          )
        ) {
          throw new TournamentError(
            'The match is not overdue',
            'NOT_OVERDUE',
            409,
          );
        }
        if (
          ![
            match.entrantAId,
            match.entrantBId,
          ].includes(
            opts.winnerEntrantId,
          )
        ) {
          throw new TournamentError(
            'Winner must be in this match',
            'BAD_WINNER',
            400,
          );
        }
        return l;
      },
    );
  const isHost =
    l
      .tournament
      .createdById ===
    opts.byUserId;
  const res =
    await settleMatch(
      {
        tournamentId:
          opts.tournamentId,
        matchId:
          opts.matchId,
        winnerEntrantId:
          opts.winnerEntrantId,
        source:
          'walkover',
        inTx: async (
          tx,
        ) => {
          // A result claim filed after the check above and before this settle
          // wins: roll the walkover back rather than override a claim.
          const open =
            await tx.tournamentMatch.findUnique(
              {
                where:
                  {
                    id: opts.matchId,
                  },
                select:
                  {
                    claimedAt:
                      true,
                  },
              },
            );
          if (
            open?.claimedAt
          ) {
            throw new TournamentError(
              'A result has been reported; confirm, dispute or decide it first',
              'OPEN_CLAIM',
              409,
            );
          }
          await recordAdminActionIn(
            tx,
            opts.byUserId,
            'tournament.match.award',
            {
              targetType:
                'TournamentMatch',
              targetId:
                opts.matchId,
              detail: `tournament:${opts.tournamentId} winner:${opts.winnerEntrantId}${isHost ? ' host' : ' admin'}`,
            },
          );
        },
      },
      db,
    );
  if (
    res.settled
  ) {
    // A claim that slipped in between the check and the settlement is stale now.
    await clearClaimAfterSettle(
      opts.matchId,
      {
        notify: false,
      },
      db,
    ).catch(
      () => {},
    );
    await notify(
      [
        ...l.users.values(),
      ],
      'match-awarded',
      opts.tournamentId,
      `The host awarded a match in ${l.tournament.name}`,
      opts.byUserId,
    );
  }
  return res;
}

// ─── Reminders ──────────────────────────────────────────────────────────────

/**
 * The per-minute job. Each notice is claimed by a conditional `updateMany` on its
 * own column before anyone is told, so overlapping runs notify once:
 * `remindedAt` for the 60-minute reminder before an agreed time, and
 * `deadlineNoticeAt` for the 12-hour notice before a deadline when no result has
 * been claimed. At most `limit` matches of each kind per run.
 */
export async function runScheduleNotices(
  db: Db = prisma,
  now: Date = new Date(),
  limit: number = SCHEDULE_NOTICE_BATCH,
): Promise<{
  reminded: number;
  deadlineNotices: number;
}> {
  const include =
    {
      tournament:
        {
          select:
            {
              id: true,
              name: true,
            },
        },
      entrantA:
        {
          select:
            {
              userId: true,
            },
        },
      entrantB:
        {
          select:
            {
              userId: true,
            },
        },
    } as const;
  const people =
    (m: {
      entrantA: {
        userId: string;
      } | null;
      entrantB: {
        userId: string;
      } | null;
    }) => [
      m
        .entrantA
        ?.userId,
      m
        .entrantB
        ?.userId,
    ];
  let reminded = 0;
  let deadlineNotices = 0;

  const soon =
    await db.tournamentMatch.findMany(
      {
        where:
          {
            state:
              {
                in: [
                  ...OPEN_STATES,
                ],
              },
            tournament:
              {
                status:
                  'LIVE',
              },
            remindedAt:
              null,
            scheduledAt:
              {
                gt: now,
                lte: new Date(
                  now.getTime() +
                    REMIND_BEFORE_MINUTES *
                      60_000,
                ),
              },
          },
        orderBy:
          {
            scheduledAt:
              'asc',
          },
        take: limit,
        include,
      },
    );
  for (const m of soon) {
    const claimed =
      await db.tournamentMatch.updateMany(
        {
          where:
            {
              id: m.id,
              state:
                {
                  in: [
                    ...OPEN_STATES,
                  ],
                },
              remindedAt:
                null,
              scheduledAt:
                m.scheduledAt,
            },
          data: {
            remindedAt:
              now,
          },
        },
      );
    if (
      claimed.count ===
      0
    )
      continue;
    reminded += 1;
    await notify(
      people(
        m,
      ),
      'match-reminder',
      m.tournamentId,
      `Your ${m.tournament.name} match is in an hour`,
    );
  }

  const late =
    await db.tournamentMatch.findMany(
      {
        where:
          {
            state:
              {
                in: [
                  ...OPEN_STATES,
                ],
              },
            tournament:
              {
                status:
                  'LIVE',
              },
            deadlineNoticeAt:
              null,
            claimedAt:
              null,
            deadlineAt:
              {
                gt: now,
                lte: new Date(
                  now.getTime() +
                    DEADLINE_NOTICE_HOURS *
                      3_600_000,
                ),
              },
          },
        orderBy:
          {
            deadlineAt:
              'asc',
          },
        take: limit,
        include,
      },
    );
  for (const m of late) {
    const claimed =
      await db.tournamentMatch.updateMany(
        {
          where:
            {
              id: m.id,
              state:
                {
                  in: [
                    ...OPEN_STATES,
                  ],
                },
              deadlineNoticeAt:
                null,
              claimedAt:
                null,
            },
          data: {
            deadlineNoticeAt:
              now,
          },
        },
      );
    if (
      claimed.count ===
      0
    )
      continue;
    deadlineNotices += 1;
    await notify(
      people(
        m,
      ),
      'match-deadline',
      m.tournamentId,
      `Your ${m.tournament.name} match is due in 12 hours`,
    );
  }
  return {
    reminded,
    deadlineNotices,
  };
}

/** Registered once from server/jobs/index.ts; only the worker's boss instance schedules. */
export async function registerMatchScheduleCron(
  boss: PgBoss,
): Promise<void> {
  await boss.createQueue(
    MATCH_SCHEDULE_QUEUE,
  );
  await boss.schedule(
    MATCH_SCHEDULE_QUEUE,
    MATCH_SCHEDULE_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(
    MATCH_SCHEDULE_QUEUE,
    async () => {
      await runScheduleNotices();
    },
  );
}

// ─── Erasure and export ─────────────────────────────────────────────────────

/**
 * Match rows are tournament records and stay; a live proposal the member made is
 * withdrawn (the reference and the time go together, so the opponent cannot accept
 * a time nobody stands behind).
 */
export function matchScheduleErasureOps(
  userId: string,
) {
  return [
    prisma.tournamentMatch.updateMany(
      {
        where:
          {
            proposedById:
              userId,
          },
        data: {
          proposedById:
            null,
          proposedAt:
            null,
        },
      },
    ),
  ];
}

/** The member's live proposals and the times agreed for their matches, for the account export. */
export async function exportMatchScheduling(
  userId: string,
) {
  const proposals =
    await prisma.tournamentMatch.findMany(
      {
        where:
          {
            proposedById:
              userId,
          },
        orderBy:
          {
            updatedAt:
              'desc',
          },
        take: 1000,
        select:
          {
            id: true,
            tournamentId: true,
            proposedAt: true,
            deadlineAt: true,
          },
      },
    );
  const agreed =
    await prisma.tournamentMatch.findMany(
      {
        where:
          {
            scheduledAt:
              {
                not: null,
              },
            OR: [
              {
                entrantA:
                  {
                    userId,
                  },
              },
              {
                entrantB:
                  {
                    userId,
                  },
              },
            ],
          },
        orderBy:
          {
            scheduledAt:
              'desc',
          },
        take: 1000,
        select:
          {
            id: true,
            tournamentId: true,
            scheduledAt: true,
            deadlineAt: true,
          },
      },
    );
  return [
    ...proposals.map(
      (
        m,
      ) => ({
        kind: 'proposal' as const,
        matchId:
          m.id,
        tournamentId:
          m.tournamentId,
        proposedAt:
          m.proposedAt,
        deadlineAt:
          m.deadlineAt,
      }),
    ),
    ...agreed.map(
      (
        m,
      ) => ({
        kind: 'agreed' as const,
        matchId:
          m.id,
        tournamentId:
          m.tournamentId,
        scheduledAt:
          m.scheduledAt,
        deadlineAt:
          m.deadlineAt,
      }),
    ),
  ];
}
