/**
 * Replay persistence (platform expansion §7).
 *
 * Thin server layer over the `GameReplay` table. All writes flow through
 * {@link saveReplay}, which is the *only* correct way to persist a replay: it
 * looks up the game's capture contract, zod-validates the payload, enforces the
 * size cap, and — when the game provides `verify()` — re-simulates the log and
 * stores the *derived* score (never the client-submitted one).
 *
 * Cleanup: a weekly pg-boss prune of unreferenced/expired replays is future
 * work (see `saveReplay` note) — not built here.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { getReplayable, REPLAY_SIZE_CAP, type ReplayData } from '@/lib/game/replay';
import { verifyDailyPuzzle } from '@/lib/daily-puzzles/replay.server';
import { getGameAdapter } from '@/lib/game/adapters.server';
import { userChipSelect, userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { BOARD_SIZE, MY_REPLAYS_PAGE } from '@/lib/game/replay-library-schema';
import {
  GHOST_GAME_IDS,
  normalizeVisibility,
  replayKind,
  visibilityChangeRefusal,
  type BoardReplay,
  type LibraryReplay,
  type MyReplaysPage,
  type ReplayVisibility,
} from '@/lib/game/replay-library';

/** Typed failure modes so API routes can map to precise HTTP statuses. */
export type ReplayErrorCode =
  | 'UNKNOWN_GAME'
  | 'INVALID_DATA'
  | 'TOO_LARGE'
  | 'VERIFY_FAILED'
  /** The replay is the proof behind a speedrun entry: it cannot be deleted or unlisted. */
  | 'SPEEDRUN_PROOF'
  /** The replay is a race ghost: it is always unlisted. */
  | 'GHOST';

export class ReplayError extends Error {
  constructor(public code: ReplayErrorCode) {
    super(code);
    this.name = 'ReplayError';
  }
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // clamp obviously-bogus durations

/**
 * Verifiers for games whose ground truth needs a database.
 *
 * `lib/game/replay.ts` is imported by the replay player and so cannot reach
 * Prisma; a game in that position sets `serverVerified: true` there and lands
 * here. Keeping the map next to `saveReplay` rather than exporting a register()
 * hook means there is exactly one file to read to find out what can verify.
 */
const SERVER_VERIFIERS: Record<string, (data: unknown) => Promise<{ score: number } | null>> = {
  'daily-puzzle': verifyDailyPuzzle,
};

export interface SaveReplayInput {
  userId: string;
  game: string;
  data: unknown;
  /** Client-submitted score — used only when the game has no `verify()`. */
  score?: number | null;
  durationMs: number;
  visibility?: 'public' | 'unlisted';
}

export interface SavedReplay {
  id: string;
  score: number | null;
  sizeBytes: number;
}

/**
 * Validate → size-check → verify → persist. Throws {@link ReplayError} on any
 * rejection so the caller can translate the `code` to a status.
 */
export async function saveReplay(input: SaveReplayInput): Promise<SavedReplay> {
  const def = getReplayable(input.game);
  if (!def) throw new ReplayError('UNKNOWN_GAME');

  const parsed = def.schema.safeParse(input.data);
  if (!parsed.success) throw new ReplayError('INVALID_DATA');
  const data = parsed.data;

  const serialized = JSON.stringify(data);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  if (sizeBytes > REPLAY_SIZE_CAP) throw new ReplayError('TOO_LARGE');

  // Verified games: the re-simulated score is authoritative. Unverified games:
  // fall back to the (sanity-clamped) submitted score.
  const asyncVerify = def.verifyAsync ?? (def.serverVerified ? SERVER_VERIFIERS[def.game] : undefined);
  if (def.serverVerified && !asyncVerify) {
    // A game that claims server-side verification and has no verifier would
    // otherwise silently fall through to trusting the client — the exact
    // outcome the claim exists to prevent. Refuse instead.
    throw new ReplayError('UNKNOWN_GAME');
  }

  let score: number | null = null;
  if (def.verify) {
    const result = def.verify(data);
    if (!result) throw new ReplayError('VERIFY_FAILED');
    score = result.score;
  } else if (asyncVerify) {
    const result = await asyncVerify(data);
    if (!result) throw new ReplayError('VERIFY_FAILED');
    score = result.score;
  } else if (typeof input.score === 'number' && Number.isFinite(input.score)) {
    score = Math.trunc(input.score);
  }

  const durationMs = Math.max(0, Math.min(Math.trunc(input.durationMs) || 0, MAX_DURATION_MS));
  const visibility = input.visibility === 'unlisted' ? 'unlisted' : 'public';

  const replay = await prisma.gameReplay.create({
    data: {
      userId: input.userId,
      game: def.game,
      version: def.version,
      score,
      durationMs,
      data: data as Prisma.InputJsonValue,
      sizeBytes,
      visibility,
    },
    select: { id: true },
  });

  return { id: replay.id, score, sizeBytes };
}

export interface ReplayView {
  id: string;
  game: string;
  version: string;
  /** The current registered logic version (for playback compatibility). */
  currentVersion: string | null;
  /** Whether the replay was recorded on the current logic version. */
  versionMatch: boolean;
  score: number | null;
  durationMs: number;
  data: ReplayData;
  visibility: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null; handle: string | null };
}

export async function getReplay(id: string): Promise<ReplayView | null> {
  const replay = await prisma.gameReplay.findUnique({
    where: { id },
    select: {
      id: true,
      game: true,
      version: true,
      score: true,
      durationMs: true,
      data: true,
      visibility: true,
      createdAt: true,
      user: { select: userDisplaySelect },
    },
  });
  if (!replay) return null;

  const def = getReplayable(replay.game);
  const display = resolveUserDisplay(replay.user);

  return {
    id: replay.id,
    game: replay.game,
    version: replay.version,
    currentVersion: def?.version ?? null,
    versionMatch: def ? def.version === replay.version : false,
    score: replay.score,
    durationMs: replay.durationMs,
    data: (replay.data ?? {}) as ReplayData,
    visibility: replay.visibility,
    createdAt: replay.createdAt.toISOString(),
    author: {
      id: replay.user.id,
      name: display.name,
      image: display.image,
      handle: replay.user.handle ?? null,
    },
  };
}

/**
 * Whether `viewerId` may open `replay`: unlisted replays are the owner's alone, and a public one is hidden from a
 * viewer who blocked its author or was blocked by them, as a post is (`canReadThread`). The owner always can.
 */
export async function canViewReplay(
  replay: { visibility: string; author: { id: string } },
  viewerId: string | null,
): Promise<boolean> {
  if (viewerId === replay.author.id) return true;
  if (replay.visibility !== 'public') return false;
  return !(await getBlockedAuthorIds(viewerId)).includes(replay.author.id);
}

/** The ids among `ids` that back a speedrun entry (`SpeedrunEntry.replayId` is a plain string, not a relation). */
async function speedrunProofIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const entries = await prisma.speedrunEntry.findMany({
    where: { replayId: { in: ids } },
    select: { replayId: true },
  });
  return new Set(entries.map((e) => e.replayId));
}

/** Whether the replay is the proof behind a speedrun entry. */
export async function isSpeedrunProof(id: string): Promise<boolean> {
  return (await speedrunProofIds([id])).has(id);
}

/**
 * Owner-only delete. Returns false when the replay does not exist or is not the caller's (the caller cannot tell
 * the two apart); throws `SPEEDRUN_PROOF` for a replay that backs a speedrun entry.
 */
export async function deleteReplay(id: string, userId: string): Promise<boolean> {
  const replay = await prisma.gameReplay.findFirst({ where: { id, userId }, select: { id: true } });
  if (!replay) return false;
  if (await isSpeedrunProof(id)) throw new ReplayError('SPEEDRUN_PROOF');
  await prisma.gameReplay.deleteMany({ where: { id, userId } });
  return true;
}

const libraryRowSelect = {
  id: true,
  game: true,
  score: true,
  durationMs: true,
  visibility: true,
  createdAt: true,
} as const;

function toLibraryReplay(
  row: {
    id: string;
    game: string;
    score: number | null;
    durationMs: number;
    visibility: string;
    createdAt: Date;
  },
  proof: boolean,
): LibraryReplay {
  return {
    id: row.id,
    game: row.game,
    score: row.score,
    durationMs: row.durationMs,
    visibility: normalizeVisibility(row.visibility),
    kind: replayKind(row.game, proof),
    createdAt: row.createdAt.toISOString(),
  };
}

/** The member's own replays, newest first (`[userId, createdAt desc]`), one page at a time. */
export async function listMyReplays(input: {
  userId: string;
  game?: string | undefined;
  cursor?: string | undefined;
}): Promise<MyReplaysPage> {
  const rows = await prisma.gameReplay.findMany({
    where: { userId: input.userId, ...(input.game ? { game: input.game } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MY_REPLAYS_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: libraryRowSelect,
  });
  const page = rows.slice(0, MY_REPLAYS_PAGE);
  const [proofs, gameRows] = await Promise.all([
    speedrunProofIds(page.map((r) => r.id)),
    prisma.gameReplay.groupBy({ by: ['game'], where: { userId: input.userId }, orderBy: { game: 'asc' } }),
  ]);
  return {
    items: page.map((r) => toLibraryReplay(r, proofs.has(r.id))),
    nextCursor: rows.length > MY_REPLAYS_PAGE ? (page[page.length - 1]?.id ?? null) : null,
    games: gameRows.map((g) => g.game),
  };
}

/**
 * Owner-only visibility change. Returns null when the replay does not exist or is not the caller's; throws
 * `SPEEDRUN_PROOF` for a replay that backs a speedrun entry and `GHOST` when asked to publish a race ghost.
 */
export async function setReplayVisibility(
  id: string,
  userId: string,
  visibility: ReplayVisibility,
): Promise<LibraryReplay | null> {
  const row = await prisma.gameReplay.findFirst({ where: { id, userId }, select: libraryRowSelect });
  if (!row) return null;
  const proof = await isSpeedrunProof(id);
  const refusal = visibilityChangeRefusal(replayKind(row.game, proof), visibility);
  if (refusal === 'speedrun') throw new ReplayError('SPEEDRUN_PROOF');
  if (refusal === 'ghost') throw new ReplayError('GHOST');
  await prisma.gameReplay.updateMany({ where: { id, userId }, data: { visibility } });
  return toLibraryReplay({ ...row, visibility }, proof);
}

export type ReplayListItem = BoardReplay;

/**
 * Public replays for a game, best score first (uses the `[game, score desc]` index). Only the current logic
 * version is listed (an older one may not play back), authors who are banned are left out, and so are authors the
 * viewer has blocked or who blocked the viewer. A response with a viewer in it is block-filtered and so must not be
 * cached for anyone else.
 */
export async function listReplaysForGame(
  game: string,
  limit = 20,
  viewerId: string | null = null,
): Promise<ReplayListItem[]> {
  const version = getReplayable(game)?.version;
  if (!version) return [];
  const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const blocked = await getBlockedAuthorIds(viewerId);
  const rows = await prisma.gameReplay.findMany({
    where: {
      game,
      version,
      visibility: 'public',
      // Postgres sorts NULL first in a descending order; an unscored run is not a board entry.
      score: { not: null },
      ...(blocked.length > 0 ? { userId: { notIn: blocked } } : {}),
      user: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: new Date() } }] },
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take,
    select: {
      id: true,
      score: true,
      durationMs: true,
      createdAt: true,
      user: { select: userDisplaySelect },
    },
  });

  return rows.map((r) => {
    const display = resolveUserDisplay(r.user);
    return {
      id: r.id,
      score: r.score,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
      author: {
        id: r.user.id,
        name: display.name,
        image: display.image,
        handle: r.user.handle ?? null,
      },
    };
  });
}

/** The rows of a game's board, or null when the game records no replays (it then has no Replays section). */
export async function boardForGame(game: string, viewerId: string | null): Promise<BoardReplay[] | null> {
  return getReplayable(game) ? listReplaysForGame(game, BOARD_SIZE, viewerId) : null;
}

/**
 * Erasure operations for `anonymizeAccount`: every replay of the member goes, except the proofs behind speedrun
 * entries, which stay as board history under the tombstone like the entry itself. Async because the proofs are
 * looked up first (the link is a plain string, so no relation filter can express it).
 */
export async function replayErasureOps(userId: string): Promise<Prisma.PrismaPromise<unknown>[]> {
  const mine = await prisma.gameReplay.findMany({ where: { userId }, select: { id: true } });
  // Tests that stub prisma with a recording proxy answer a list read with an op object, not rows.
  const proofs = Array.isArray(mine) ? await speedrunProofIds(mine.map((r) => r.id)) : new Set<string>();
  return [
    prisma.gameReplay.deleteMany({
      where: { userId, ...(proofs.size > 0 ? { id: { notIn: [...proofs] } } : {}) },
    }),
  ];
}

/** The member's replays for the account export: metadata only (never the input log). */
export async function exportReplays(userId: string) {
  const rows = await prisma.gameReplay.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: { id: true, game: true, score: true, durationMs: true, visibility: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    game: r.game,
    score: r.score,
    durationMs: r.durationMs,
    visibility: r.visibility,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* ------------------------------------------------------------------ *
 * Ghosts (plan U9)
 * ------------------------------------------------------------------ */

/** Games whose keyframe replays double as race ghosts, keyed by their level field. */
const GHOST_GAMES = new Set(GHOST_GAME_IDS);

export interface GhostView {
  replayId: string;
  data: unknown;
  owner: { id: string; name: string | null; handle: string | null; image: string | null };
}

const ghostWhere = (game: string, level: number) => ({
  game,
  version: getReplayable(game)?.version,
  data: { path: ['level'], equals: level },
});

/**
 * Save a ghost and drop the same player's older ghosts for that level, so a
 * player holds one ghost per level no matter how many bests they set. Ghosts
 * are `unlisted` — they exist to be raced, not browsed.
 */
export async function saveGhost(input: {
  userId: string;
  game: string;
  level: number;
  data: unknown;
  score: number;
  durationMs: number;
}): Promise<SavedReplay> {
  if (!GHOST_GAMES.has(input.game)) throw new ReplayError('UNKNOWN_GAME');
  const saved = await saveReplay({
    userId: input.userId,
    game: input.game,
    data: input.data,
    score: input.score,
    durationMs: input.durationMs,
    visibility: 'unlisted',
  });
  await prisma.gameReplay
    .deleteMany({
      where: { userId: input.userId, id: { not: saved.id }, ...ghostWhere(input.game, input.level) },
    })
    .catch(() => {});
  return saved;
}

/**
 * The ghost to race.
 *
 * - `pb`: the caller's own best ghost on this level.
 * - `top`: the best ghost among the top of the VALIDATED leaderboard. A ghost's
 *   own score is client-reported, so ranking ghosts by it would let a forged
 *   upload become everyone's "world #1"; instead the owner must hold a real
 *   board position, and their ghost may not claim more than that board score.
 */
export async function getGhost(input: {
  game: string;
  level: number;
  vs: 'pb' | 'top';
  viewerId: string | null;
}): Promise<GhostView | null> {
  if (!GHOST_GAMES.has(input.game)) return null;
  const select = {
    id: true,
    data: true,
    user: { select: userChipSelect },
  } as const;

  if (input.vs === 'pb') {
    if (!input.viewerId) return null;
    const row = await prisma.gameReplay.findFirst({
      where: { userId: input.viewerId, ...ghostWhere(input.game, input.level) },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      select,
    });
    return row ? { replayId: row.id, data: row.data, owner: row.user } : null;
  }

  const board = (await getGameAdapter(input.game)?.leaderboard(5)) ?? [];
  for (const entry of board) {
    if (!entry.userId) continue;
    const row = await prisma.gameReplay.findFirst({
      where: {
        userId: entry.userId,
        score: { lte: entry.score },
        ...ghostWhere(input.game, input.level),
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      select,
    });
    if (row) return { replayId: row.id, data: row.data, owner: row.user };
  }
  return null;
}
