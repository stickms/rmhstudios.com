/**
 * Co-op runs the hub vouches for (sprint 15 09), server side: the host finishes a run the hub started, the board and a
 * member's own list resolve every name live under board privacy, the data export, the erasure of a member's name from
 * every run (new rows and old ones) and the nightly prune.
 *
 * The hub (`../server/handlers.ts`) writes the row at the start of a co-op game with the lobby's accounts by slot
 * (`memberIds`, from the socket session). Nothing a client posts names an account: the host's post carries a run id and
 * per-slot scores, and the accounts come from `memberIds`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import {
  COOP_BOARD_SIZE,
  COOP_DELETED_NAME,
  COOP_MINE_PAGE_SIZE,
  decodeCoopCursor,
  encodeCoopCursor,
  finishCutoff,
  pruneCutoff,
  readStoredPlayers,
  resolvePlayerView,
  slotAccountId,
  type CoopBoardEntry,
  type CoopCursor,
  type CoopUserLookup,
  type MyCoopRun,
  type MyCoopRunsPage,
  type StoredPlayer,
} from './coop-runs';

export type CoopDifficulty = 'easy' | 'normal' | 'hard' | 'lunatic';
export type CoopMetric = 'combined' | 'time';

const METRIC_FIELD = { combined: 'combinedScore', time: 'timeSurvived' } as const;

/** A bad cursor token: the endpoint answers 400. */
export class CoopCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'CoopCursorError';
  }
}

// ─── Finish ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FinishInput {
  runId: string;
  combinedScore: number;
  timeSurvived: number;
  stageReached: number;
  cleared: boolean;
  /** Per lobby slot: the score and character the host's game reports, and the name a guest typed. */
  players: { slot: number; name: string; charId: string; score: number }[];
}

/**
 * The host finishes the run the hub started, once. One conditional `updateMany` repeats every condition in its `where`
 * (the run, the caller as host, still unfinished, started within the finish window, this many players), so two
 * posts at once, another member's post, a stale run and an unknown id all come back as `false`.
 *
 * A signed-in slot stores no name: it is resolved live at read time, so the row never holds a name that can go stale or
 * outlive the account. A guest's slot keeps the name they typed.
 */
export async function finishCoopRun(userId: string, input: FinishInput, now: Date = new Date()): Promise<boolean> {
  const run = await prisma.dreamRiftCoopRun.findFirst({
    where: { id: input.runId, hostUserId: userId, finishedAt: null, startedAt: { gte: finishCutoff(now) } },
    select: { memberIds: true, playerCount: true },
  });
  if (!run) return false;
  // The post covers exactly the seats the hub recorded, and every signed-in member's seat among them: the host can
  // claim the scores, but cannot drop a member from the run or add a seat that was never taken.
  const posted = new Set(input.players.map((p) => p.slot));
  const everyMemberPosted = run.memberIds.every((id, slot) => id === '' || posted.has(slot));
  if (input.players.length !== run.playerCount || !everyMemberPosted) return false;
  const stored = input.players.map((p) => ({
    slot: p.slot,
    name: run.memberIds[p.slot] ? '' : p.name,
    charId: p.charId,
    score: p.score,
  }));
  const res = await prisma.dreamRiftCoopRun.updateMany({
    where: {
      id: input.runId,
      hostUserId: userId,
      finishedAt: null,
      startedAt: { gte: finishCutoff(now) },
      playerCount: input.players.length,
    },
    data: {
      finishedAt: now,
      combinedScore: input.combinedScore,
      timeSurvived: input.timeSurvived,
      stageReached: input.stageReached,
      cleared: input.cleared,
      players: stored satisfies Prisma.InputJsonValue,
    },
  });
  return res.count === 1;
}

// ─── Reads ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface RunRow {
  startedAt: Date | null;
  memberIds: string[];
  players: Prisma.JsonValue;
}

/** Every account a set of runs names, looked up once. Guests and the sentinel are never queried. */
async function lookupUsers(runs: readonly RunRow[]): Promise<Map<string, CoopUserLookup>> {
  const ids = new Set<string>();
  for (const run of runs) {
    for (const p of readStoredPlayers(run.players)) {
      const id = slotAccountId(run, p);
      if (id !== null && id !== DELETED_USER_ID) ids.add(id);
    }
  }
  const users = new Map<string, CoopUserLookup>();
  if (ids.size === 0) return users;
  const rows = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { ...userChipSelect, bannedUntil: true, banReason: true },
  });
  for (const u of Array.isArray(rows) ? rows : []) users.set(u.id, u);
  return users;
}

function viewsFor(
  run: RunRow,
  users: ReadonlyMap<string, CoopUserLookup>,
  hidden: ReadonlySet<string>,
  blocked: ReadonlySet<string> | undefined,
  now: Date,
) {
  return readStoredPlayers(run.players).map((p: StoredPlayer) =>
    resolvePlayerView(p, slotAccountId(run, p), users, { hidden, blocked }, now),
  );
}

/**
 * The co-op board: the top 20 for a difficulty by combined score or time survived. Only finished hub runs and rows
 * written before the feature rank, so a started and unposted run (score 0) never takes a place. A member who turned
 * boards off or is banned stays on the run as "A player".
 */
export async function listCoopBoard(difficulty: CoopDifficulty, metric: CoopMetric): Promise<CoopBoardEntry[]> {
  const hidden = await leaderboardHiddenUserIds();
  const rows = await prisma.dreamRiftCoopRun.findMany({
    where: { difficulty, OR: [{ finishedAt: { not: null } }, { startedAt: null }] },
    take: COOP_BOARD_SIZE,
    orderBy: [{ [METRIC_FIELD[metric]]: 'desc' }, { createdAt: 'desc' }],
    select: {
      combinedScore: true,
      timeSurvived: true,
      stageReached: true,
      cleared: true,
      playerCount: true,
      players: true,
      startedAt: true,
      memberIds: true,
      createdAt: true,
    },
  });
  const users = await lookupUsers(rows);
  const now = new Date();
  return rows.map((row) => ({
    combinedScore: row.combinedScore,
    timeSurvived: row.timeSurvived,
    stageReached: row.stageReached,
    cleared: row.cleared,
    playerCount: row.playerCount,
    players: viewsFor(row, users, hidden, undefined, now),
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The member's own finished co-op runs, newest first, 20 a page on `(finishedAt, id)`. The other players are current
 * names, "A player" (hidden, banned or across a block either way) or "Deleted user": never an account id.
 */
export async function listMyCoopRuns(userId: string, token?: string): Promise<MyCoopRunsPage> {
  let cursor: CoopCursor | null = null;
  if (token) {
    cursor = decodeCoopCursor(token);
    if (!cursor) throw new CoopCursorError();
  }
  const where = {
    memberIds: { has: userId },
    finishedAt: { not: null },
    ...(cursor ? { OR: [{ finishedAt: { lt: cursor.at } }, { finishedAt: cursor.at, id: { lt: cursor.id } }] } : {}),
  } satisfies Prisma.DreamRiftCoopRunWhereInput;
  const rows = await prisma.dreamRiftCoopRun.findMany({
    where,
    orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
    take: COOP_MINE_PAGE_SIZE + 1,
    select: {
      id: true,
      difficulty: true,
      combinedScore: true,
      timeSurvived: true,
      stageReached: true,
      cleared: true,
      playerCount: true,
      players: true,
      startedAt: true,
      finishedAt: true,
      memberIds: true,
      createdAt: true,
    },
  });
  const page = rows.slice(0, COOP_MINE_PAGE_SIZE);
  const last = page[page.length - 1];
  const [users, hidden, blocked] = await Promise.all([
    lookupUsers(page),
    leaderboardHiddenUserIds(),
    getBlockedAuthorIds(userId),
  ]);
  const blockedIds = new Set(blocked);
  const now = new Date();
  const runs: MyCoopRun[] = page.map((row) => ({
    id: row.id,
    difficulty: row.difficulty,
    combinedScore: row.combinedScore,
    timeSurvived: row.timeSurvived,
    stageReached: row.stageReached,
    cleared: row.cleared,
    playerCount: row.playerCount,
    // The member's own slot is "you" to them, not a name: it is shown by the screen, so it is dropped from the others.
    players: viewsFor(row, users, hidden, blockedIds, now).filter((_p, i) => {
      const stored = readStoredPlayers(row.players)[i];
      return !stored || slotAccountId(row, stored) !== userId;
    }),
    createdAt: row.createdAt.toISOString(),
    endedAt: (row.finishedAt ?? row.createdAt).toISOString(),
  }));
  return {
    runs,
    nextCursor:
      rows.length > COOP_MINE_PAGE_SIZE && last?.finishedAt
        ? encodeCoopCursor({ at: last.finishedAt, id: last.id })
        : null,
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DreamRiftCoopExport {
  runs: {
    finishedAt: string | null;
    difficulty: string;
    combinedScore: number;
    timeSurvived: number;
    stageReached: number;
    cleared: boolean;
    playerCount: number;
  }[];
}

/** The member's co-op runs for the data export. The other players are a count only: their ids and names are theirs. */
export async function exportDreamRiftCoop(userId: string): Promise<DreamRiftCoopExport> {
  const rows = await prisma.dreamRiftCoopRun.findMany({
    where: { memberIds: { has: userId }, finishedAt: { not: null } },
    orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
    select: {
      finishedAt: true,
      difficulty: true,
      combinedScore: true,
      timeSurvived: true,
      stageReached: true,
      cleared: true,
      playerCount: true,
    },
  });
  return {
    runs: (Array.isArray(rows) ? rows : []).map((r) => ({
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      difficulty: r.difficulty,
      combinedScore: r.combinedScore,
      timeSurvived: r.timeSurvived,
      stageReached: r.stageReached,
      cleared: r.cleared,
      playerCount: r.playerCount,
    })),
  };
}

// ─── Erasure ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A run whose stored players name the erased member, with the rewritten list. */
export interface CoopErasureUpdate {
  id: string;
  players: Prisma.InputJsonValue;
}

/** One stored player with the erased member's slot rewritten, any other field of it left exactly as it was. */
function scrubStoredPlayer(
  row: { startedAt: Date | null; memberIds: readonly string[] },
  item: unknown,
  userId: string,
): { value: unknown; changed: boolean } {
  const player = readStoredPlayers([item])[0];
  if (!player || slotAccountId(row, player) !== userId) return { value: item, changed: false };
  const original = item as { account?: unknown };
  return {
    value: {
      ...original,
      name: COOP_DELETED_NAME,
      ...(original.account ? { account: { id: DELETED_USER_ID } } : {}),
    },
    changed: true,
  };
}

/**
 * Pre-step of `anonymizeAccount` (a read before its transaction). The member's account is removed from every run, new
 * rows and old ones, and their slot's name becomes "Deleted user":
 *
 *  1. here, the runs are read: the hub's rows by `memberIds`, rows written before the feature by their stored account
 *     object (`players` `array_contains` `[{ account: { id } }]`), and the players JSON rewrites are worked out;
 *  2. in the transaction (`dreamRiftCoopErasureOps`), the JSON is rewritten, and the member's id in `memberIds` becomes
 *     the "Deleted user" account's id in one statement that repeats the match in its `WHERE` (atomic, so two members
 *     erased at once never undo each other, and re-run safe). The slot keeps its place, so the other slots still line
 *     up with their ids. Both writes commit or neither does, so a failed transaction leaves the rows for the retry to
 *     find again.
 *
 * A started and unfinished run holds no names yet, so there is nothing to rewrite there (and nothing the host's later
 * post could be overwritten by). Rows read here may have been pruned by the time the transaction runs: the updates are
 * `updateMany`, which does nothing for a missing row.
 *

 */
export async function eraseCoopMembership(userId: string): Promise<CoopErasureUpdate[]> {
  const rows = await prisma.dreamRiftCoopRun.findMany({
    where: {
      OR: [{ memberIds: { has: userId } }, { players: { array_contains: [{ account: { id: userId } }] } }],
    },
    select: { id: true, startedAt: true, finishedAt: true, memberIds: true, players: true },
  });
  const updates: CoopErasureUpdate[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.startedAt !== null && row.finishedAt === null) continue;
    if (!Array.isArray(row.players)) continue;
    let changed = false;
    const players = row.players.map((item) => {
      const scrubbed = scrubStoredPlayer(row, item, userId);
      changed = changed || scrubbed.changed;
      return scrubbed.value;
    });
    if (changed) updates.push({ id: row.id, players: players as Prisma.InputJsonValue });
  }
  return updates;
}

/**
 * The transaction half of the erasure: one `updateMany` per run whose JSON named the member, then the `memberIds`
 * replacement. Raw SQL names the real table and quoted camelCase columns (the model has no `@@map`). A test stub
 * without `$executeRaw` gets no statement, as in `erasure-follows.server.ts`.
 */
export function dreamRiftCoopErasureOps(userId: string, updates: readonly CoopErasureUpdate[]) {
  const ops: Prisma.PrismaPromise<unknown>[] = updates.map((u) =>
    prisma.dreamRiftCoopRun.updateMany({ where: { id: u.id }, data: { players: u.players } }),
  );
  if (typeof prisma.$executeRaw === 'function') {
    ops.push(
      prisma.$executeRaw`UPDATE "DreamRiftCoopRun" SET "memberIds" = array_replace("memberIds", ${userId}, ${DELETED_USER_ID}) WHERE "memberIds" @> ARRAY[${userId}]::text[]`,
    );
  }
  return ops;
}

// ─── Prune ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rows deleted per statement by the nightly prune, and the most statements in one run. */
export const COOP_PRUNE_BATCH = 1000;
const MAX_BATCHES = 100;

/**
 * Delete runs the hub started more than 24 hours ago that were never finished. A row from before the feature has no
 * `startedAt` and is never touched, and neither is a finished one. Returns how many rows went.
 */
export async function pruneUnfinishedCoopRuns(
  now: Date = new Date(),
  batch: number = COOP_PRUNE_BATCH,
): Promise<number> {
  const cutoff = pruneCutoff(now);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await prisma.dreamRiftCoopRun.findMany({
      where: { finishedAt: null, startedAt: { lt: cutoff } },
      select: { id: true },
      take: batch,
    });
    const ids = (Array.isArray(rows) ? rows : []).map((r) => r.id);
    if (ids.length === 0) break;
    const res = await prisma.dreamRiftCoopRun.deleteMany({
      where: { id: { in: ids }, finishedAt: null, startedAt: { lt: cutoff } },
    });
    total += res.count;
    if (ids.length < batch) break;
  }
  return total;
}
