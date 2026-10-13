/**
 * F5 — body-doubling match. Server-only.
 *
 * `requestMatch` either pairs the caller with a waiting member (same subject
 * key, same length, same time) or queues them. The whole decision runs under a
 * per-(subject, length) advisory lock, so two members arriving together cannot
 * both queue past each other or both claim the same partner.
 *
 * The match row carries a room code. The room itself is created lazily by the
 * socket hub when the first of the pair joins inside the session window (see
 * `server/socket-server/handlers/rmhstudy.ts`) — reusing the hub's own room
 * creation — so a no-show leaves nothing behind. Unmatched requests and old
 * matches expire in `sweepStudyBuddy`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { loadPeople } from './people.server';
import {
  STUDY_MAX_WAITING,
  STUDY_QUEUE_MS,
  STUDY_SLOT_GRACE_MS,
  isStudySlot,
  subjectKey,
} from './study-buddy';
import type { StudyBuddyMatchView, StudyBuddyStatus, StudyBuddyWaitingView } from './types';

export type StudyResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({
  ok: false,
  status,
  error,
});

/** Same alphabet as the socket hub's room codes (no look-alike characters). */
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++)
    out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return out;
}

export interface StudyRequestInput {
  subject: string;
  preset?: string;
  lengthMin: 25 | 50;
  /** Null/undefined = now. */
  startsAt?: Date | null;
}

export async function requestMatch(
  userId: string,
  input: StudyRequestInput,
): Promise<StudyResult<{ matched: boolean }>> {
  const now = new Date();
  const key = subjectKey(input.subject, input.preset);
  if (key.length < 2) return fail(400, 'Pick a subject');
  const mode = input.startsAt ? 'slot' : 'now';
  if (input.startsAt && !isStudySlot(input.startsAt, now))
    return fail(400, 'That time is not available');
  const startsAt = input.startsAt ?? now;
  const expiresAt =
    mode === 'now'
      ? new Date(now.getTime() + STUDY_QUEUE_MS)
      : new Date(startsAt.getTime() + STUDY_SLOT_GRACE_MS);

  const outcome = await prisma
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`study-buddy:${key}:${input.lengthMin}`}))`;

      await tx.studyBuddyRequest.updateMany({
        where: { userId, status: 'waiting', expiresAt: { lte: now } },
        data: { status: 'expired' },
      });
      const mine = await tx.studyBuddyRequest.findMany({
        where: { userId, status: 'waiting' },
        select: { mode: true, subjectKey: true, lengthMin: true, startsAt: true },
        take: STUDY_MAX_WAITING + 1,
      });
      if (mine.length >= STUDY_MAX_WAITING) return 'too-many' as const;
      if (mode === 'now' && mine.some((m) => m.mode === 'now')) return 'already-queued' as const;
      if (
        mine.some(
          (m) =>
            m.mode === 'slot' &&
            m.subjectKey === key &&
            m.lengthMin === input.lengthMin &&
            m.startsAt.getTime() === startsAt.getTime(),
        )
      ) {
        return 'duplicate' as const;
      }

      const candidates = await tx.studyBuddyRequest.findMany({
        where: {
          status: 'waiting',
          subjectKey: key,
          lengthMin: input.lengthMin,
          userId: { not: userId },
          expiresAt: { gt: now },
          ...(mode === 'now' ? { mode: 'now' } : { mode: 'slot', startsAt }),
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: { id: true, userId: true },
      });
      let partner: { id: string; userId: string } | null = null;
      if (candidates.length) {
        const blocks = await tx.userBlock.findMany({
          where: {
            OR: [
              { blockerId: userId, blockedId: { in: candidates.map((c) => c.userId) } },
              { blockedId: userId, blockerId: { in: candidates.map((c) => c.userId) } },
            ],
          },
          select: { blockerId: true, blockedId: true },
          take: 40,
        });
        const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
        partner = candidates.find((c) => !blocked.has(c.userId)) ?? null;
      }

      if (!partner) {
        await tx.studyBuddyRequest.create({
          data: {
            userId,
            subjectKey: key,
            subject: input.subject,
            lengthMin: input.lengthMin,
            mode,
            startsAt,
            expiresAt,
          },
        });
        return { matched: false as const };
      }

      // Claim the partner's request; a lost race (already matched/cancelled) falls back to queueing.
      const claimed = await tx.studyBuddyRequest.updateMany({
        where: { id: partner.id, status: 'waiting' },
        data: { status: 'matched' },
      });
      if (claimed.count === 0) {
        await tx.studyBuddyRequest.create({
          data: {
            userId,
            subjectKey: key,
            subject: input.subject,
            lengthMin: input.lengthMin,
            mode,
            startsAt,
            expiresAt,
          },
        });
        return { matched: false as const };
      }
      const match = await tx.studyBuddyMatch.create({
        data: {
          roomCode: roomCode(),
          subject: input.subject,
          lengthMin: input.lengthMin,
          startsAt,
          endsAt: new Date(startsAt.getTime() + input.lengthMin * 60_000),
          userAId: partner.userId,
          userBId: userId,
        },
      });
      await tx.studyBuddyRequest.update({ where: { id: partner.id }, data: { matchId: match.id } });
      await tx.studyBuddyRequest.create({
        data: {
          userId,
          subjectKey: key,
          subject: input.subject,
          lengthMin: input.lengthMin,
          mode,
          startsAt,
          expiresAt,
          status: 'matched',
          matchId: match.id,
        },
      });
      return { matched: true as const, match, partnerId: partner.userId };
    })
    .catch((e: unknown) => {
      // A room-code collision is a 1-in-a-billion retry; surface as a soft failure.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return 'retry' as const;
      throw e;
    });

  if (outcome === 'too-many') return fail(409, 'You have too many pending requests');
  if (outcome === 'already-queued')
    return fail(409, 'You are already looking for a partner right now');
  if (outcome === 'duplicate') return fail(409, 'You already asked for that slot');
  if (outcome === 'retry') return fail(503, 'Please try again');
  if (!outcome.matched) return { ok: true, value: { matched: false } };

  const people = await loadPeople([userId, outcome.partnerId]);
  const m = outcome.match;
  const link = `/rmhstudy/${m.roomCode}?bd=${m.id}`;
  const when =
    mode === 'now' ? 'right now' : `at ${m.startsAt.toUTCString().replace(':00 GMT', ' UTC')}`;
  for (const [to, other] of [
    [userId, outcome.partnerId],
    [outcome.partnerId, userId],
  ] as const) {
    void createNotification({
      userId: to,
      actorId: other,
      type: 'SYSTEM',
      entityType: 'study-buddy',
      entityId: m.id,
      preview: `Study buddy found: ${people.get(other)?.name ?? 'a member'} will do ${m.lengthMin} minutes of ${m.subject} with you ${when}.`,
      link,
    });
  }
  return { ok: true, value: { matched: true } };
}

export async function cancelRequest(userId: string, requestId: string): Promise<boolean> {
  const res = await prisma.studyBuddyRequest.updateMany({
    where: { id: requestId, userId, status: 'waiting' },
    data: { status: 'canceled' },
  });
  return res.count > 0;
}

export async function getStatus(userId: string): Promise<StudyBuddyStatus> {
  const now = new Date();
  // Lazy expiry, so a member never sees a request that already lapsed.
  await prisma.studyBuddyRequest.updateMany({
    where: { userId, status: 'waiting', expiresAt: { lte: now } },
    data: { status: 'expired' },
  });
  const [waiting, matches] = await Promise.all([
    prisma.studyBuddyRequest.findMany({
      where: { userId, status: 'waiting' },
      orderBy: { startsAt: 'asc' },
      take: STUDY_MAX_WAITING,
      select: {
        id: true,
        subject: true,
        lengthMin: true,
        startsAt: true,
        expiresAt: true,
        mode: true,
      },
    }),
    prisma.studyBuddyMatch.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }], endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: 10,
    }),
  ]);
  const people = await loadPeople(
    matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId)),
  );
  const waitingViews: StudyBuddyWaitingView[] = waiting.map((w) => ({
    requestId: w.id,
    subject: w.subject,
    lengthMin: w.lengthMin,
    startsAt: w.startsAt.toISOString(),
    expiresAt: w.expiresAt.toISOString(),
    mode: w.mode === 'slot' ? 'slot' : 'now',
  }));
  const matchViews: StudyBuddyMatchView[] = matches.flatMap((m) => {
    const partner = people.get(m.userAId === userId ? m.userBId : m.userAId);
    return partner
      ? [
          {
            id: m.id,
            roomCode: m.roomCode,
            subject: m.subject,
            lengthMin: m.lengthMin,
            startsAt: m.startsAt.toISOString(),
            endsAt: m.endsAt.toISOString(),
            partner,
          },
        ]
      : [];
  });
  return { waiting: waitingViews, matches: matchViews };
}

/**
 * Expiry (pg-boss, every few minutes). Waiting requests past their window are
 * expired and their owners told nobody turned up; matches long over are removed.
 * Idempotent — safe if delivered twice.
 */
export async function sweepStudyBuddy(
  now: Date = new Date(),
): Promise<{ expired: number; removed: number }> {
  const stale = await prisma.studyBuddyRequest.findMany({
    where: { status: 'waiting', expiresAt: { lte: now } },
    take: 500,
    select: { id: true, userId: true, subject: true, mode: true },
  });
  let expired = 0;
  for (const r of stale) {
    const res = await prisma.studyBuddyRequest.updateMany({
      where: { id: r.id, status: 'waiting' },
      data: { status: 'expired' },
    });
    if (res.count === 0) continue;
    expired++;
    void createNotification({
      userId: r.userId,
      type: 'SYSTEM',
      entityType: 'study-buddy',
      entityId: r.id,
      preview:
        r.mode === 'now'
          ? `No study partner for ${r.subject} turned up this time. Try again or book a slot.`
          : `Nobody else booked your ${r.subject} study slot. Try another time.`,
      link: '/rmhstudy',
    });
  }
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const [matches, requests] = await Promise.all([
    prisma.studyBuddyMatch.deleteMany({ where: { endsAt: { lt: cutoff } } }),
    prisma.studyBuddyRequest.deleteMany({
      where: { status: { not: 'waiting' }, expiresAt: { lt: cutoff } },
    }),
  ]);
  return { expired, removed: matches.count + requests.count };
}
