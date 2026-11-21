/**
 * Tournament check-in, the write side (s04-03).
 *
 * Every write takes the per-tournament advisory lock (the same key the start
 * takes) and claims the tournament row while it is still REGISTRATION, the way
 * `withdrawFromTournament` does, so a check-in racing the start is either seen
 * by it or refused. Dropping and refunding no-shows is `startTournament`'s job
 * (`tournament.server.ts`); this module only records who is here.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import {
  CHECK_IN_MINUTES,
  checkInOpensAt,
  isCheckInMinutes,
  isCheckInOpen,
} from '@/lib/tournaments/checkin';
import { TournamentError } from '@/lib/tournaments/tournament.server';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
type Actor = { byUserId: string; isAdmin?: boolean };

/** Most tournaments one notice run claims; the next minute's run takes the rest. */
export const NOTICE_BATCH = 100;

/** Lock, load and claim one tournament that is still taking registrations. */
async function claimRegistration(tx: Tx, tournamentId: string) {
  await lockKey(tx, `tournament:${tournamentId}`);
  const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
  if (t.status !== 'REGISTRATION') {
    throw new TournamentError('Check-in is closed', 'CLOSED', 409);
  }
  const claimed = await tx.tournament.updateMany({
    where: { id: t.id, status: 'REGISTRATION' },
    data: { updatedAt: new Date() },
  });
  if (claimed.count === 0) throw new TournamentError('Check-in is closed', 'CLOSED', 409);
  return t;
}

function assertHost(t: { createdById: string }, actor: Actor): void {
  if (t.createdById !== actor.byUserId && !actor.isAdmin) {
    throw new TournamentError('Only the host can do this', 'FORBIDDEN', 403);
  }
}

/** The signed-in entrant checks themselves in. Only their own row; repeating it is a no-op. */
export async function checkIn(
  opts: { tournamentId: string; userId: string },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await claimRegistration(tx, opts.tournamentId);
    if (t.checkInMinutes == null) {
      throw new TournamentError('This tournament has no check-in', 'NO_CHECKIN', 409);
    }
    if (!isCheckInOpen(t, now)) {
      throw new TournamentError('Check-in has not opened yet', 'NOT_OPEN', 409);
    }
    const marked = await tx.tournamentEntrant.updateMany({
      where: { tournamentId: t.id, userId: opts.userId, checkedInAt: null },
      data: { checkedInAt: now },
    });
    if (marked.count > 0) return;
    const entrant = await tx.tournamentEntrant.findUnique({
      where: { tournamentId_userId: { tournamentId: t.id, userId: opts.userId } },
      select: { id: true },
    });
    if (!entrant) throw new TournamentError('You are not registered', 'NOT_ENTERED', 404);
  });
}

async function setHostCheckIn(
  opts: Actor & { tournamentId: string; userId: string },
  checkedIn: boolean,
  db: Db,
  now: Date,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await claimRegistration(tx, opts.tournamentId);
    assertHost(t, opts);
    if (t.checkInMinutes == null) {
      throw new TournamentError('This tournament has no check-in', 'NO_CHECKIN', 409);
    }
    const marked = await tx.tournamentEntrant.updateMany({
      where: { tournamentId: t.id, userId: opts.userId },
      data: { checkedInAt: checkedIn ? now : null },
    });
    if (marked.count === 0) throw new TournamentError('Not an entrant', 'NOT_ENTERED', 404);
  });
}

/** The host (or an admin) checks an entrant in by hand. */
export function hostCheckIn(
  opts: Actor & { tournamentId: string; userId: string },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<void> {
  return setHostCheckIn(opts, true, db, now);
}

/** The host (or an admin) takes a manual check-in back, before the start. */
export function undoHostCheckIn(
  opts: Actor & { tournamentId: string; userId: string },
  db: Db = prisma,
): Promise<void> {
  return setHostCheckIn(opts, false, db, new Date());
}

/**
 * The host (or an admin) sets the window while registration is open; null turns
 * check-in off. A tournament with no start time cannot have one. Moving the
 * window to a time still ahead lets the cron notify again; a window already open
 * keeps its notice, so changing 30 to 60 minutes does not re-notify.
 */
export async function updateCheckInSettings(
  opts: Actor & { tournamentId: string; checkInMinutes: number | null },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<void> {
  if (opts.checkInMinutes != null && !isCheckInMinutes(opts.checkInMinutes)) {
    throw new TournamentError(
      `Check-in is one of ${CHECK_IN_MINUTES.join(', ')} minutes`,
      'BAD_WINDOW',
      400,
    );
  }
  await db.$transaction(async (tx) => {
    const t = await claimRegistration(tx, opts.tournamentId);
    assertHost(t, opts);
    if (opts.checkInMinutes != null && !t.startsAt) {
      throw new TournamentError('Check-in needs a start time', 'NO_START_TIME', 400);
    }
    const opensAt = checkInOpensAt({ startsAt: t.startsAt, checkInMinutes: opts.checkInMinutes });
    const reopens = opensAt != null && opensAt.getTime() > now.getTime();
    await tx.tournament.update({
      where: { id: t.id },
      data: {
        checkInMinutes: opts.checkInMinutes,
        ...(opts.checkInMinutes == null || reopens ? { checkInNoticeAt: null } : {}),
      },
    });
    if (opts.checkInMinutes == null) {
      // Off: forget who had checked in, so turning it on later starts clean.
      await tx.tournamentEntrant.updateMany({
        where: { tournamentId: t.id },
        data: { checkedInAt: null },
      });
    }
  });
}

/**
 * The `tournaments.checkin-open` job: tell each entrant once that check-in has
 * opened. A tournament is claimed with a conditional `updateMany`
 * (`checkInNoticeAt: null` to now) before anyone is notified, so overlapping runs
 * notify it once. One query per window length keeps it exact without raw SQL: a
 * tournament is due when `startsAt <= now + its window`. At most `limit`
 * tournaments per run; answers how many this run claimed.
 */
export async function runCheckInNotices(
  db: Db = prisma,
  now: Date = new Date(),
  limit: number = NOTICE_BATCH,
): Promise<number> {
  let claimedTotal = 0;
  for (const minutes of CHECK_IN_MINUTES) {
    const room = limit - claimedTotal;
    if (room <= 0) break;
    const due = await db.tournament.findMany({
      where: {
        status: 'REGISTRATION',
        checkInMinutes: minutes,
        checkInNoticeAt: null,
        startsAt: { lte: new Date(now.getTime() + minutes * 60_000) },
      },
      orderBy: { startsAt: 'asc' },
      take: room,
      select: { id: true, name: true },
    });
    for (const t of due) {
      const claimed = await db.tournament.updateMany({
        where: {
          id: t.id,
          status: 'REGISTRATION',
          checkInMinutes: minutes,
          checkInNoticeAt: null,
        },
        data: { checkInNoticeAt: now },
      });
      if (claimed.count === 0) continue;
      claimedTotal += 1;
      const entrants = await db.tournamentEntrant.findMany({
        where: { tournamentId: t.id },
        select: { userId: true },
      });
      await Promise.allSettled(
        entrants.map((e) =>
          createNotification({
            userId: e.userId,
            type: 'SYSTEM',
            entityType: 'tournament_checkin',
            entityId: t.id,
            preview: `Check-in is open for ${t.name}`,
            link: `/tournaments/${t.id}`,
          }),
        ),
      );
    }
  }
  return claimedTotal;
}
