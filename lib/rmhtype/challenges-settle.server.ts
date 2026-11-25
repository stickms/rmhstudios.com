/**
 * RMHType challenges: the transitions the socket hub makes (claim a race, settle it) and the ones the hourly job
 * makes (expire, settle a stale race). Kept apart from `./challenges.server` so the hub bundle does not load the web
 * tier's Prisma module: the caller passes its own client in, and the imports below are relative (server bundle), the
 * same split as `./ghost-save.server`.
 *
 * Every transition is a compare-and-set `updateMany` on `status`, so two requests that race for the same challenge
 * (a second tab, a reload, two finishes) change it once. The result is computed from the server's own figures
 * (`evaluateFinish`), never from what the client said.
 */
import type { Prisma } from '@prisma/client';
import { refusalBody, type ErrorCode } from '../errors/codes';
import { notice, type NoticeKey, type NoticePreview } from '../notifications/notice-keys';
import {
  RACING_STALE_MS,
  challengePassage,
  decideOutcome,
  passageTitle,
  resultFor,
  round2,
  type ChallengeOutcome,
  type ChallengeSnapshot,
  type RaceFigures,
} from './challenges';

/** The slice of a Prisma client these need (the hub passes its own). */
export type ChallengeDb = Pick<
  Prisma.TransactionClient,
  'rmhTypeChallenge' | 'userBlock' | 'user' | 'notification' | 'follow' | 'notificationPreference'
>;

/** The entity type of the inbox rows these write; its label is in `components/feed/notification-labels.ts`. */
export const CHALLENGE_ENTITY = 'type-challenge';
export const CHALLENGES_LINK = '/rmhtype/challenges';

export type Refusal = { ok: false; status: 403 | 404 | 409 | 410; error: string; code: ErrorCode };
const refuse = (status: Refusal['status'], code: ErrorCode): Refusal => ({ ok: false, status, ...refusalBody(code) });

/** A name for a sentence: the display name a member chose, else their name, else their handle. */
const NAME_SELECT = { id: true, name: true, handle: true, profile: { select: { displayName: true } } } as const;
type Named = { name: string | null; handle: string | null; profile: { displayName: string | null } | null };
const nameOf = (m: Named | null | undefined): string => m?.profile?.displayName ?? m?.name ?? m?.handle ?? '';

/** What the hub needs to start a race. */
export interface ClaimedRace {
  id: string;
  passageId: string;
  challengerId: string;
  challengerName: string;
  snapshot: ChallengeSnapshot;
}

/**
 * The opponent starts the race: the challenge must be theirs, pending and not lapsed, with nobody blocked or banned
 * since it was sent. `pending` -> `racing` is the one compare-and-set, so a second start (another tab, a reload)
 * finds `racing` and is refused: a race is one attempt.
 */
export async function claimChallengeRace(
  db: ChallengeDb,
  userId: string,
  challengeId: string,
  now: Date = new Date(),
): Promise<({ ok: true } & { race: ClaimedRace }) | Refusal> {
  const row = await db.rmhTypeChallenge.findUnique({
    where: { id: challengeId },
    select: {
      id: true,
      challengerId: true,
      opponentId: true,
      passageId: true,
      status: true,
      expiresAt: true,
      challengerWpm: true,
      challengerAccuracy: true,
      challengerTimeMs: true,
      samples: true,
      challenger: { select: { ...NAME_SELECT, bannedUntil: true, deletionScheduledAt: true } },
      opponent: { select: { bannedUntil: true, deletionScheduledAt: true } },
    },
  });
  // Only the opponent may race: anyone else reads the same as a challenge that is not there.
  if (!row || row.opponentId !== userId) return refuse(404, 'NOT_FOUND');
  // One attempt: a race that has started (a second tab, a reload) or been settled is not raced again.
  if (row.status === 'racing' || row.status === 'done') return refuse(409, 'TYPE_CHALLENGE_RACED');
  if (row.status !== 'pending') return refuse(410, 'GONE');
  if (row.expiresAt.getTime() <= now.getTime()) return refuse(410, 'GONE');
  // The text is re-read from the curated source when the race starts; a passage that has left it cannot be raced, and
  // the attempt is not spent.
  if (!challengePassage(row.passageId)) return refuse(410, 'GONE');
  const banned = (m: { bannedUntil: Date | null }) => !!m.bannedUntil && m.bannedUntil.getTime() > now.getTime();
  if (
    banned(row.challenger) ||
    banned(row.opponent) ||
    row.challenger.deletionScheduledAt ||
    row.opponent.deletionScheduledAt
  ) {
    return refuse(403, 'TYPE_CHALLENGE_UNAVAILABLE');
  }
  const blocked = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: row.challengerId, blockedId: userId },
        { blockerId: userId, blockedId: row.challengerId },
      ],
    },
    select: { id: true },
  });
  if (blocked) return refuse(403, 'TYPE_CHALLENGE_UNAVAILABLE');
  // The curve goes to a mutual only: one who has unfollowed since the challenge was sent cannot race it (the attempt
  // is not spent).
  const edges = await db.follow.count({
    where: {
      OR: [
        { followerId: row.challengerId, followingId: userId },
        { followerId: userId, followingId: row.challengerId },
      ],
    },
  });
  if (edges !== 2) return refuse(403, 'TYPE_CHALLENGE_UNAVAILABLE');

  const claimed = await db.rmhTypeChallenge.updateMany({
    where: { id: challengeId, opponentId: userId, status: 'pending', expiresAt: { gt: now } },
    data: { status: 'racing', raceStartedAt: now },
  });
  if (claimed.count !== 1) return refuse(409, 'TYPE_CHALLENGE_RACED');
  return {
    ok: true,
    race: {
      id: row.id,
      passageId: row.passageId,
      challengerId: row.challengerId,
      challengerName: nameOf(row.challenger),
      snapshot: {
        wpm: row.challengerWpm,
        accuracy: row.challengerAccuracy,
        timeMs: row.challengerTimeMs,
        samples: row.samples,
      },
    },
  };
}

/** A race that has just been settled, for the notices. */
export interface Settlement {
  id: string;
  passageId: string;
  challengerId: string;
  opponentId: string;
  outcome: ChallengeOutcome;
  /** `false` is "Did not finish". */
  finished: boolean;
  challengerWpm: number;
  opponentWpm: number | null;
}

/**
 * Settle a `racing` challenge once. `figures` are the server's checked figures for the opponent's run, or `null` for a
 * run that was left, timed out or went stale ("Did not finish": the challenger wins). A run whose figures fail a check
 * (`finished: false`) is also "Did not finish", and its unchecked figures are not stored. Returns the settlement, or
 * `null` when it was not `racing` (already settled by another request, or never started) or is not this opponent's.
 */
export async function settleChallengeRace(
  db: ChallengeDb,
  challengeId: string,
  figures: RaceFigures | null,
  opponentId?: string,
  now: Date = new Date(),
): Promise<Settlement | null> {
  const row = await db.rmhTypeChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, passageId: true, challengerId: true, opponentId: true, status: true, challengerWpm: true },
  });
  if (!row || row.status !== 'racing') return null;
  if (opponentId !== undefined && row.opponentId !== opponentId) return null;

  const finished = !!figures && figures.finished;
  const outcome: ChallengeOutcome = finished && figures ? decideOutcome(row.challengerWpm, figures) : 'challenger';
  const won = await db.rmhTypeChallenge.updateMany({
    where: { id: challengeId, status: 'racing' },
    data: {
      status: 'done',
      outcome,
      finished,
      settledAt: now,
      ...(finished && figures
        ? {
            opponentWpm: round2(figures.wpm),
            opponentAccuracy: round2(figures.accuracy),
            opponentTimeMs: Math.round(figures.timeMs),
          }
        : {}),
    },
  });
  if (won.count !== 1) return null;
  return {
    id: row.id,
    passageId: row.passageId,
    challengerId: row.challengerId,
    opponentId: row.opponentId,
    outcome,
    finished,
    challengerWpm: row.challengerWpm,
    opponentWpm: finished && figures ? round2(figures.wpm) : null,
  };
}

/** One result notice, in the shape both `createNotification` (the web tier) and the hub's direct write take. */
export interface ChallengeNotice {
  userId: string;
  actorId: string;
  type: 'SYSTEM';
  entityType: typeof CHALLENGE_ENTITY;
  entityId: string;
  preview: NoticePreview<NoticeKey>;
  link: string;
}

/** The notice a received challenge sends the opponent. */
export function receivedNotice(input: {
  id: string;
  challengerId: string;
  opponentId: string;
  challengerName: string;
  wpm: number;
  passageId: string;
}): ChallengeNotice {
  return {
    userId: input.opponentId,
    actorId: input.challengerId,
    type: 'SYSTEM',
    entityType: CHALLENGE_ENTITY,
    entityId: input.id,
    preview: notice('type-challenge-received', {
      name: input.challengerName,
      wpm: Math.round(input.wpm),
      passage: passageTitle(input.passageId),
    }),
    link: CHALLENGES_LINK,
  };
}

/** The two result notices, one for each side, each worded from that member's side. */
export function resultNotices(s: Settlement, names: { challenger: string; opponent: string }): ChallengeNotice[] {
  const passage = passageTitle(s.passageId);
  const side = (role: 'challenger' | 'opponent'): ChallengeNotice => {
    const userId = role === 'challenger' ? s.challengerId : s.opponentId;
    const other = role === 'challenger' ? s.opponentId : s.challengerId;
    const name = role === 'challenger' ? names.opponent : names.challenger;
    const wpm = Math.round((role === 'challenger' ? s.opponentWpm : s.challengerWpm) ?? 0);
    const result = resultFor(role, s.outcome, s.finished);
    const preview =
      result === 'won'
        ? notice('type-challenge-won', { name, wpm, passage })
        : result === 'lost'
          ? notice('type-challenge-lost', { name, wpm, passage })
          : result === 'drew'
            ? notice('type-challenge-draw', { name, wpm, passage })
            : result === 'unfinished'
              ? notice('type-challenge-unfinished', { name, wpm, passage })
              : notice('type-challenge-forfeited', { name, passage });
    return {
      userId,
      actorId: other,
      type: 'SYSTEM',
      entityType: CHALLENGE_ENTITY,
      entityId: s.id,
      preview,
      link: CHALLENGES_LINK,
    };
  };
  return [side('challenger'), side('opponent')];
}

/** Read both members' names for a settlement and build its notices. */
export async function resultNoticesFor(db: ChallengeDb, s: Settlement): Promise<ChallengeNotice[]> {
  const rows = await db.user.findMany({ where: { id: { in: [s.challengerId, s.opponentId] } }, select: NAME_SELECT });
  const byId = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.id, nameOf(r)]));
  return resultNotices(s, {
    challenger: byId.get(s.challengerId) ?? '',
    opponent: byId.get(s.opponentId) ?? '',
  });
}

/**
 * Settle a race and tell both sides, from the hub (its own client, no web-tier notification preferences: the same
 * direct write the party invites use). Best-effort on the notices: a failure to write one never undoes the result.
 */
export async function settleAndNotify(
  db: ChallengeDb,
  challengeId: string,
  figures: RaceFigures | null,
  opponentId?: string,
): Promise<Settlement | null> {
  const settled = await settleChallengeRace(db, challengeId, figures, opponentId);
  if (!settled) return null;
  try {
    for (const n of await resultNoticesFor(db, settled)) {
      // The hub cannot call the web tier's `createNotification`, so it honours the one preference that tier would:
      // the member's in-app "system" switch (no row = on). The hub sends no push, so quiet hours do not apply.
      const pref = await db.notificationPreference.findUnique({
        where: { userId: n.userId },
        select: { system: true },
      });
      if (pref && pref.system === false) continue;
      await db.notification.create({
        data: {
          userId: n.userId,
          actorId: n.actorId,
          type: n.type,
          entityType: n.entityType,
          entityId: n.entityId,
          preview: n.preview.fallback.slice(0, 280),
          previewKey: n.preview.key,
          previewParams: n.preview.params,
          link: n.link,
        },
      });
    }
  } catch {
    // The result stands; the inbox row is a courtesy.
  }
  return settled;
}

/** What one pass of the hourly job did. */
export interface ExpiryPass {
  expired: number;
  settled: Settlement[];
}

/**
 * Hourly: a `pending` challenge past its expiry becomes `expired` (no notice), and a `racing` one older than 15
 * minutes is settled as "Did not finish" (a hub restart loses the room, so nothing else would). Each is a
 * compare-and-set, so a race finishing as the job runs is settled once, by whoever got there first.
 */
export async function expireChallenges(db: ChallengeDb, now: Date = new Date()): Promise<ExpiryPass> {
  const lapsed = await db.rmhTypeChallenge.updateMany({
    where: { status: 'pending', expiresAt: { lte: now } },
    data: { status: 'expired' },
  });
  const stale = await db.rmhTypeChallenge.findMany({
    where: { status: 'racing', raceStartedAt: { lte: new Date(now.getTime() - RACING_STALE_MS) } },
    select: { id: true },
    orderBy: { raceStartedAt: 'asc' },
    take: 500,
  });
  const settled: Settlement[] = [];
  for (const { id } of Array.isArray(stale) ? stale : []) {
    const s = await settleChallengeRace(db, id, null, undefined, now);
    if (s) settled.push(s);
  }
  return { expired: lapsed.count, settled };
}
