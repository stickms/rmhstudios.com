/**
 * "Your runs" (sprint 13 03), server side: the member's own finished solo runs, their co-op matches and the
 * export of both. Every read is keyed by the session's user id (the endpoint takes no user id).
 *
 * `AltairSoloRun`: `[userId, issuedAt desc]`; `AltairMatchPlayer`: `[userId]` and the match's own row. Both pages
 * are keyset-paged on `(time, id)` and fetch one extra row to know whether a next page exists. A teammate's name
 * is read now from their user row (never the copied `AltairMatchPlayer.userName`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import {
  RUNS_PAGE_SIZE,
  decodeRunsCursor,
  encodeRunsCursor,
  isListedSoloStatus,
  LISTED_SOLO_STATUSES,
  parseSoloResult,
  rejectReasonKey,
  type CoopMatchView,
  type CoopMatchesPage,
  type SoloRunView,
  type SoloRunsPage,
  type TeammateView,
} from './runs';

/** A bad cursor token: the endpoint answers 400. */
export class RunsCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'RunsCursorError';
  }
}

const TOMBSTONE_NAME = 'Deleted user';

function readCursor(token: string | undefined) {
  if (!token) return null;
  const cursor = decodeRunsCursor(token);
  if (!cursor) throw new RunsCursorError();
  return cursor;
}

function toSoloView(row: {
  id: string;
  classId: string;
  doubleTime: boolean;
  issuedAt: Date;
  status: string;
  result: unknown;
  rejectReason: string | null;
  coinsCredited: number;
  firstClearBonus: number;
}): SoloRunView | null {
  if (!isListedSoloStatus(row.status)) return null;
  const verified = row.status === 'verified';
  return {
    id: row.id,
    classId: row.classId,
    doubleTime: row.doubleTime,
    issuedAt: row.issuedAt.toISOString(),
    status: row.status,
    // Only a verified run's `result` is the replay's; nothing else is parsed or shown.
    result: verified ? parseSoloResult(row.result) : null,
    reason: row.status === 'rejected' || row.status === 'unverified' ? rejectReasonKey(row.rejectReason) : null,
    coinsCredited: verified ? row.coinsCredited : 0,
    firstClear: verified && row.firstClearBonus > 0,
  };
}

/** The member's solo runs that left `open`, newest first, 20 a page on `(issuedAt, id)`. */
export async function listSoloRuns(userId: string, token?: string): Promise<SoloRunsPage> {
  const cursor = readCursor(token);
  const where = {
    userId,
    status: { in: [...LISTED_SOLO_STATUSES] },
    ...(cursor
      ? {
          OR: [{ issuedAt: { lt: cursor.at } }, { issuedAt: cursor.at, id: { lt: cursor.id } }],
        }
      : {}),
  } satisfies Prisma.AltairSoloRunWhereInput;
  const rows = await prisma.altairSoloRun.findMany({
    where,
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    take: RUNS_PAGE_SIZE + 1,
    select: {
      id: true,
      classId: true,
      doubleTime: true,
      issuedAt: true,
      status: true,
      result: true,
      rejectReason: true,
      coinsCredited: true,
      firstClearBonus: true,
    },
  });
  const page = rows.slice(0, RUNS_PAGE_SIZE);
  const last = page[page.length - 1];
  const runs: SoloRunView[] = [];
  for (const row of page) {
    const view = toSoloView(row);
    if (view) runs.push(view);
  }
  return {
    kind: 'solo',
    runs,
    nextCursor: rows.length > RUNS_PAGE_SIZE && last ? encodeRunsCursor({ at: last.issuedAt, id: last.id }) : null,
  };
}

/** Teammates as the member may see them: current name, "Deleted user" for an erased one, "A player" across a block. */
export function teammateView(
  row: { userId: string; classId: string; user: { id: string; name: string | null } | null },
  blockedIds: ReadonlySet<string>,
): TeammateView {
  if (blockedIds.has(row.userId)) return { kind: 'blocked', classId: row.classId };
  const user = row.user;
  if (!user || user.id === DELETED_USER_ID || user.name === TOMBSTONE_NAME || !user.name) {
    return { kind: 'deleted', classId: row.classId };
  }
  return { kind: 'player', name: user.name, classId: row.classId };
}

/** Both directions of `UserBlock` between the member and anyone, read once. */
async function blockedEitherWay(userId: string): Promise<Set<string>> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of Array.isArray(rows) ? rows : []) ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return ids;
}

/** The member's co-op matches, newest first, 20 a page on `(createdAt, id)` of their own `AltairMatchPlayer` row. */
export async function listCoopMatches(userId: string, token?: string): Promise<CoopMatchesPage> {
  const cursor = readCursor(token);
  const where = {
    userId,
    ...(cursor
      ? {
          OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }],
        }
      : {}),
  } satisfies Prisma.AltairMatchPlayerWhereInput;
  const rows = await prisma.altairMatchPlayer.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RUNS_PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      classId: true,
      finalLevel: true,
      kills: true,
      coinsEarned: true,
      timeSurvived: true,
      wasDowned: true,
      wasRevived: true,
      revivesGiven: true,
      wasAliveAtEnd: true,
      match: {
        select: {
          id: true,
          victory: true,
          durationMs: true,
          playerCount: true,
          doubleTime: true,
          sharedKills: true,
          bossesDefeated: true,
          // Teammates: the match's other players, joined to their user rows (the copied `userName` is not read).
          players: {
            where: { userId: { not: userId } },
            orderBy: { slot: 'asc' },
            select: { userId: true, classId: true, user: { select: userChipSelect } },
          },
        },
      },
    },
  });
  const page = rows.slice(0, RUNS_PAGE_SIZE);
  const last = page[page.length - 1];
  const blocked = page.length > 0 ? await blockedEitherWay(userId) : new Set<string>();
  const matches: CoopMatchView[] = page.map((row) => ({
    id: row.id,
    playedAt: row.createdAt.toISOString(),
    victory: row.match.victory,
    durationMs: row.match.durationMs,
    playerCount: row.match.playerCount,
    doubleTime: row.match.doubleTime,
    sharedKills: row.match.sharedKills,
    bossesDefeated: row.match.bossesDefeated.length,
    me: {
      classId: row.classId,
      finalLevel: row.finalLevel,
      kills: row.kills,
      coinsEarned: row.coinsEarned,
      timeSurvived: row.timeSurvived,
      wasDowned: row.wasDowned,
      wasRevived: row.wasRevived,
      revivesGiven: row.revivesGiven,
      wasAliveAtEnd: row.wasAliveAtEnd,
    },
    teammates: row.match.players.map((p) => teammateView(p, blocked)),
  }));
  return {
    kind: 'coop',
    matches,
    nextCursor: rows.length > RUNS_PAGE_SIZE && last ? encodeRunsCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

export interface AltairRunsExport {
  soloRuns: Array<{
    id: string;
    classId: string;
    doubleTime: boolean;
    status: string;
    issuedAt: string;
    submittedAt: string | null;
    verifiedAt: string | null;
    result: unknown;
    rejectReason: string | null;
    coinsCredited: number;
    firstClearBonus: number;
  }>;
  coopMatches: Array<{
    matchId: string;
    playedAt: string;
    classId: string;
    finalLevel: number;
    kills: number;
    coinsEarned: number;
    timeSurvived: number;
    wasDowned: boolean;
    wasRevived: boolean;
    revivesGiven: number;
    wasAliveAtEnd: boolean;
    match: {
      victory: boolean;
      durationMs: number | null;
      playerCount: number;
      doubleTime: boolean;
      sharedKills: number;
      bossesDefeated: string[];
    };
  }>;
}

/**
 * The member's solo runs and co-op rows for the data export. Seeds and loadouts are run internals, not the member's
 * data, and are not exported; teammates are not named (their data is theirs).
 */
export async function exportAltairRuns(userId: string): Promise<AltairRunsExport> {
  const [solo, coop] = await Promise.all([
    prisma.altairSoloRun.findMany({
      where: { userId },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        classId: true,
        doubleTime: true,
        status: true,
        issuedAt: true,
        submittedAt: true,
        verifiedAt: true,
        result: true,
        rejectReason: true,
        coinsCredited: true,
        firstClearBonus: true,
      },
    }),
    prisma.altairMatchPlayer.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        matchId: true,
        createdAt: true,
        classId: true,
        finalLevel: true,
        kills: true,
        coinsEarned: true,
        timeSurvived: true,
        wasDowned: true,
        wasRevived: true,
        revivesGiven: true,
        wasAliveAtEnd: true,
        match: {
          select: {
            victory: true,
            durationMs: true,
            playerCount: true,
            doubleTime: true,
            sharedKills: true,
            bossesDefeated: true,
          },
        },
      },
    }),
  ]);
  return {
    soloRuns: (Array.isArray(solo) ? solo : []).map((r) => ({
      id: r.id,
      classId: r.classId,
      doubleTime: r.doubleTime,
      status: r.status,
      issuedAt: r.issuedAt.toISOString(),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      result: r.result ?? null,
      rejectReason: r.rejectReason,
      coinsCredited: r.coinsCredited,
      firstClearBonus: r.firstClearBonus,
    })),
    coopMatches: (Array.isArray(coop) ? coop : []).map((r) => ({
      matchId: r.matchId,
      playedAt: r.createdAt.toISOString(),
      classId: r.classId,
      finalLevel: r.finalLevel,
      kills: r.kills,
      coinsEarned: r.coinsEarned,
      timeSurvived: r.timeSurvived,
      wasDowned: r.wasDowned,
      wasRevived: r.wasRevived,
      revivesGiven: r.revivesGiven,
      wasAliveAtEnd: r.wasAliveAtEnd,
      match: {
        victory: r.match.victory,
        durationMs: r.match.durationMs,
        playerCount: r.match.playerCount,
        doubleTime: r.match.doubleTime,
        sharedKills: r.match.sharedKills,
        bossesDefeated: r.match.bossesDefeated,
      },
    })),
  };
}
