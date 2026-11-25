/**
 * RMHType challenges (s11-12), the web tier: send one, decline one, list a member's, the switch, who can be asked and
 * which runs can be sent. The hub's transitions (claim, settle) and the job's are in `./challenges-settle.server`.
 *
 * A challenge goes only to a mutual (each follows the other), never across a block, a ban or a pending deletion,
 * never to a member who turned challenges off. Every one of those reads the same to the sender ("can't be challenged"),
 * so a challenge is no way to find out who blocked whom. The caps are check-then-insert, so they run in a transaction
 * that first takes `lockKey(tx, 'type-challenges:<challengerId>')`.
 */
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import {
  CHALLENGE_TTL_MS,
  MAX_OPEN_CHALLENGES,
  MAX_OPEN_PER_OPPONENT,
  MIN_CHALLENGE_ACCURACY,
  SETTLED_LIST_LIMIT,
  challengePassage,
  isChallengeSnapshot,
  passageTitle,
  type ChallengeMember,
  type ChallengeRow,
  type ChallengeStatus,
  type ChallengeableRun,
  type ChallengesView,
} from '@/lib/rmhtype/challenges';
import { PASSAGES } from '@/lib/rmhtype/passages';
import { CODE_SNIPPETS } from '@/lib/rmhtype/sources';
import { receivedNotice } from '@/lib/rmhtype/challenges-settle.server';

export type ChallengeResult<T = object> =
  ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409; error: string; code: ErrorCode };

const refuse = (status: 400 | 403 | 404 | 409, code: ErrorCode, params?: { max?: number }) =>
  ({ ok: false, status, ...refusalBody(code, params) }) as const;

type MemberName = { name: string | null; handle: string | null; profile: { displayName: string | null } | null };
const nameOf = (m: MemberName): string => m.profile?.displayName ?? m.name ?? m.handle ?? '';
/** A member as a name: the chip fields and the display name they chose. */
const MEMBER_NAME = { ...userChipSelect, profile: { select: { displayName: true } } } as const;
const MEMBER_STATE = { ...MEMBER_NAME, bannedUntil: true, deletionScheduledAt: true } as const;

const banned = (m: { bannedUntil: Date | null }, now: Date) =>
  !!m.bannedUntil && m.bannedUntil.getTime() > now.getTime();

const asMember = (id: string, m: MemberName): ChallengeMember => ({ id, name: nameOf(m), handle: m.handle });

/** Every member in a block with `userId`, either way: they appear in none of the member's lists. */
async function blockedWith(userId: string, among?: readonly string[]): Promise<Set<string>> {
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: userId, ...(among ? { blockedId: { in: [...among] } } : {}) },
        { blockedId: userId, ...(among ? { blockerId: { in: [...among] } } : {}) },
      ],
    },
    select: { blockerId: true, blockedId: true },
    take: 5000,
  });
  const out = new Set<string>();
  for (const r of Array.isArray(rows) ? rows : []) out.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return out;
}

/** Whether each follows the other. */
async function areMutuals(a: string, b: string): Promise<boolean> {
  const edges = await prisma.follow.count({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
  });
  return edges === 2;
}

/**
 * Send the member's best run on a curated passage to a mutual. Refused for a passage that is not curated (a saved
 * text, a generated or news-sentence passage, an unknown id), a passage the member has no ghost on, someone who is
 * not a mutual, is blocked either way, banned, deleting or has challenges off, and past either cap.
 */
export async function sendChallenge(
  challengerId: string,
  opponentId: string,
  passageId: string,
  now: Date = new Date(),
): Promise<ChallengeResult<{ challenge: ChallengeRow }>> {
  const passage = challengePassage(passageId);
  if (!passage) return refuse(400, 'TYPE_CHALLENGE_PASSAGE');
  if (opponentId === challengerId) return refuse(400, 'INVALID_INPUT');

  const [opponent, me, optedOut] = await Promise.all([
    prisma.user.findUnique({ where: { id: opponentId }, select: MEMBER_STATE }),
    prisma.user.findUnique({ where: { id: challengerId }, select: MEMBER_STATE }),
    prisma.rmhTypeChallengeOptOut.findUnique({ where: { userId: opponentId }, select: { userId: true } }),
  ]);
  if (!me) return refuse(404, 'NOT_FOUND');
  const unavailable = refuse(403, 'TYPE_CHALLENGE_UNAVAILABLE');
  if (!opponent || optedOut || banned(opponent, now) || opponent.deletionScheduledAt) return unavailable;
  if (banned(me, now) || me.deletionScheduledAt) return refuse(403, 'FORBIDDEN');
  if ((await blockedWith(challengerId, [opponentId])).has(opponentId)) return unavailable;
  if (!(await areMutuals(challengerId, opponentId))) return unavailable;

  const ghost = await prisma.rmhTypeGhost.findUnique({
    where: { userId_passageId: { userId: challengerId, passageId } },
    select: { wpm: true, timeMs: true, samples: true },
  });
  if (!ghost) return refuse(409, 'TYPE_CHALLENGE_NO_RUN');
  // The ghost keeps no accuracy (only that it was at least 90% when kept): read the run it came from, else the floor.
  const source = await prisma.rmhTypeMatchPlayer.findFirst({
    where: { userId: challengerId, wpm: ghost.wpm, match: { passageId, isSolo: true } },
    orderBy: { createdAt: 'desc' },
    select: { accuracy: true },
  });
  const snapshot = {
    wpm: ghost.wpm,
    accuracy: Math.min(100, Math.max(MIN_CHALLENGE_ACCURACY, source?.accuracy ?? MIN_CHALLENGE_ACCURACY)),
    timeMs: ghost.timeMs,
    samples: ghost.samples,
  };
  if (!isChallengeSnapshot(snapshot, passageId)) return refuse(409, 'TYPE_CHALLENGE_NO_RUN');

  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `type-challenges:${challengerId}`);
    const open = { status: { in: ['pending', 'racing'] }, expiresAt: { gt: now } };
    const [total, toThem] = await Promise.all([
      tx.rmhTypeChallenge.count({ where: { challengerId, ...open } }),
      tx.rmhTypeChallenge.count({ where: { challengerId, opponentId, ...open } }),
    ]);
    if (total >= MAX_OPEN_CHALLENGES) return refuse(409, 'TYPE_CHALLENGE_FULL', { max: MAX_OPEN_CHALLENGES });
    if (toThem >= MAX_OPEN_PER_OPPONENT) {
      return refuse(409, 'TYPE_CHALLENGE_PAIR_FULL', { max: MAX_OPEN_PER_OPPONENT });
    }
    const row = await tx.rmhTypeChallenge.create({
      data: {
        challengerId,
        opponentId,
        passageId,
        challengerWpm: snapshot.wpm,
        challengerAccuracy: snapshot.accuracy,
        challengerTimeMs: snapshot.timeMs,
        samples: snapshot.samples,
        status: 'pending',
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
      },
      select: { id: true, createdAt: true, expiresAt: true },
    });
    return { ok: true, row } as const;
  });
  if (!outcome.ok) return outcome;

  try {
    await createNotification(
      receivedNotice({
        id: outcome.row.id,
        challengerId,
        opponentId,
        challengerName: nameOf(me),
        wpm: snapshot.wpm,
        passageId,
      }),
    );
  } catch (error) {
    // Best-effort: a notice that fails to send never fails the challenge.
    console.error('[type-challenges] could not notify', error);
  }
  return {
    ok: true,
    challenge: {
      id: outcome.row.id,
      role: 'challenger',
      passageId,
      title: passageTitle(passageId),
      status: 'pending',
      challengerWpm: snapshot.wpm,
      challengerAccuracy: snapshot.accuracy,
      challengerTimeMs: snapshot.timeMs,
      opponentWpm: null,
      opponentAccuracy: null,
      opponentTimeMs: null,
      outcome: null,
      finished: null,
      createdAt: outcome.row.createdAt.toISOString(),
      expiresAt: outcome.row.expiresAt.toISOString(),
      settledAt: null,
      challenger: asMember(challengerId, me),
      opponent: asMember(opponentId, opponent),
    },
  };
}

/** The opponent declines: the pending row only, compare-and-set. Nobody is told. */
export async function declineChallenge(
  userId: string,
  challengeId: string,
  now: Date = new Date(),
): Promise<ChallengeResult> {
  const { count } = await prisma.rmhTypeChallenge.updateMany({
    where: { id: challengeId, opponentId: userId, status: 'pending' },
    data: { status: 'declined', settledAt: now },
  });
  return count === 1 ? { ok: true } : refuse(404, 'NOT_FOUND');
}

const ROW_SELECT = {
  id: true,
  challengerId: true,
  opponentId: true,
  passageId: true,
  status: true,
  challengerWpm: true,
  challengerAccuracy: true,
  challengerTimeMs: true,
  opponentWpm: true,
  opponentAccuracy: true,
  opponentTimeMs: true,
  outcome: true,
  finished: true,
  createdAt: true,
  expiresAt: true,
  settledAt: true,
  challenger: { select: MEMBER_NAME },
  opponent: { select: MEMBER_NAME },
} as const;

type RowData = {
  id: string;
  challengerId: string;
  opponentId: string;
  passageId: string;
  status: string;
  challengerWpm: number;
  challengerAccuracy: number;
  challengerTimeMs: number;
  opponentWpm: number | null;
  opponentAccuracy: number | null;
  opponentTimeMs: number | null;
  outcome: string | null;
  finished: boolean | null;
  createdAt: Date;
  expiresAt: Date;
  settledAt: Date | null;
  challenger: MemberName & { handle: string | null };
  opponent: MemberName & { handle: string | null };
};

function toRow(userId: string, r: RowData): ChallengeRow {
  return {
    id: r.id,
    role: r.challengerId === userId ? 'challenger' : 'opponent',
    passageId: r.passageId,
    title: passageTitle(r.passageId),
    status: r.status as ChallengeStatus,
    challengerWpm: r.challengerWpm,
    challengerAccuracy: r.challengerAccuracy,
    challengerTimeMs: r.challengerTimeMs,
    opponentWpm: r.opponentWpm,
    opponentAccuracy: r.opponentAccuracy,
    opponentTimeMs: r.opponentTimeMs,
    outcome: (r.outcome as ChallengeRow['outcome']) ?? null,
    finished: r.finished,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
    challenger: asMember(r.challengerId, r.challenger),
    opponent: asMember(r.opponentId, r.opponent),
  };
}

/**
 * The member's challenges: received (to race or decline), sent (waiting or racing) and the last 50 settled, with the
 * switch. A challenge with a member in a block with the reader is in none of them.
 */
export async function listChallenges(userId: string, now: Date = new Date()): Promise<ChallengesView> {
  const open = [{ status: 'pending', expiresAt: { gt: now } }, { status: 'racing' }];
  const [optOut, received, sent, settled, blocked] = await Promise.all([
    prisma.rmhTypeChallengeOptOut.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.rmhTypeChallenge.findMany({
      where: { opponentId: userId, OR: open },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: MAX_OPEN_CHALLENGES * 5,
      select: ROW_SELECT,
    }),
    prisma.rmhTypeChallenge.findMany({
      where: { challengerId: userId, OR: open },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: MAX_OPEN_CHALLENGES,
      select: ROW_SELECT,
    }),
    prisma.rmhTypeChallenge.findMany({
      where: { status: 'done', OR: [{ challengerId: userId }, { opponentId: userId }] },
      orderBy: [{ settledAt: 'desc' }, { id: 'asc' }],
      take: SETTLED_LIST_LIMIT,
      select: ROW_SELECT,
    }),
    blockedWith(userId),
  ]);
  const visible = (rows: unknown): ChallengeRow[] =>
    (Array.isArray(rows) ? (rows as RowData[]) : [])
      .filter((r) => !blocked.has(r.challengerId === userId ? r.opponentId : r.challengerId))
      .map((r) => toRow(userId, r));
  return { enabled: !optOut, received: visible(received), sent: visible(sent), settled: visible(settled) };
}

/** The switch: a row means challenges are off, no row means on (the default). */
export async function setChallengesEnabled(userId: string, enabled: boolean): Promise<boolean> {
  if (enabled) await prisma.rmhTypeChallengeOptOut.deleteMany({ where: { userId } });
  else {
    await prisma.rmhTypeChallengeOptOut.upsert({ where: { userId }, create: { userId }, update: {} });
  }
  return enabled;
}

/**
 * The members the caller can challenge: they follow each other, and neither is blocked, banned, deleting or has
 * challenges off. The caller's own mutuals only, never anyone else's follow list.
 */
export async function listMutuals(userId: string, now: Date = new Date()): Promise<ChallengeMember[]> {
  const rows = await prisma.user.findMany({
    where: {
      id: { not: userId },
      deletionScheduledAt: null,
      OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }],
      rmhTypeChallengeOptOut: null,
      followers: { some: { followerId: userId } },
      following: { some: { followingId: userId } },
    },
    orderBy: [{ handle: 'asc' }, { id: 'asc' }],
    take: 200,
    select: MEMBER_NAME,
  });
  const people = Array.isArray(rows) ? rows : [];
  const blocked = await blockedWith(
    userId,
    people.map((p) => p.id),
  );
  return people.filter((p) => !blocked.has(p.id)).map((p) => asMember(p.id, p));
}

/** The caller's own bests that can be sent: a ghost on a curated passage, fastest first. */
export async function listChallengeableRuns(userId: string): Promise<ChallengeableRun[]> {
  const ids = [...PASSAGES.map((p) => p.id), ...CODE_SNIPPETS.map((s) => `code-${s.id}`)];
  const rows = await prisma.rmhTypeGhost.findMany({
    where: { userId, passageId: { in: ids } },
    orderBy: [{ wpm: 'desc' }, { passageId: 'asc' }],
    take: 100,
    select: { passageId: true, wpm: true, timeMs: true },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    passageId: r.passageId,
    title: passageTitle(r.passageId),
    wpm: r.wpm,
    timeMs: r.timeMs,
  }));
}

/**
 * The account export's `typeChallenges` section: the challenges the member sent and received, with the member's own
 * figures, the other side's speed (which the member was shown) and the handle of the other member. No curves.
 */
export async function exportTypeChallenges(userId: string) {
  const rows = await prisma.rmhTypeChallenge.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    orderBy: { createdAt: 'asc' },
    take: 2000,
    select: {
      id: true,
      challengerId: true,
      passageId: true,
      status: true,
      challengerWpm: true,
      challengerAccuracy: true,
      challengerTimeMs: true,
      opponentWpm: true,
      opponentAccuracy: true,
      opponentTimeMs: true,
      outcome: true,
      finished: true,
      createdAt: true,
      settledAt: true,
      challenger: { select: { handle: true } },
      opponent: { select: { handle: true } },
    },
  });
  const optOut = await prisma.rmhTypeChallengeOptOut.findUnique({ where: { userId }, select: { createdAt: true } });
  return {
    challengesOn: !optOut,
    challenges: (Array.isArray(rows) ? rows : []).map((r) => {
      const sent = r.challengerId === userId;
      return {
        id: r.id,
        role: sent ? 'challenger' : 'opponent',
        passage: r.passageId,
        status: r.status,
        with: (sent ? r.opponent : r.challenger).handle,
        yourWpm: sent ? r.challengerWpm : r.opponentWpm,
        yourAccuracy: sent ? r.challengerAccuracy : r.opponentAccuracy,
        yourTimeMs: sent ? r.challengerTimeMs : r.opponentTimeMs,
        theirWpm: sent ? r.opponentWpm : r.challengerWpm,
        outcome: r.outcome,
        finished: r.finished,
        sentAt: r.createdAt.toISOString(),
        settledAt: r.settledAt?.toISOString() ?? null,
      };
    }),
  };
}
