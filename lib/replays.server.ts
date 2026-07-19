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

import { prisma } from '@/lib/prisma.server';
import { getReplayable, REPLAY_SIZE_CAP, type ReplayData } from '@/lib/game/replay';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';

/** Typed failure modes so API routes can map to precise HTTP statuses. */
export type ReplayErrorCode =
  | 'UNKNOWN_GAME'
  | 'INVALID_DATA'
  | 'TOO_LARGE'
  | 'VERIFY_FAILED'
  | 'FORBIDDEN';

export class ReplayError extends Error {
  constructor(public code: ReplayErrorCode) {
    super(code);
    this.name = 'ReplayError';
  }
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // clamp obviously-bogus durations

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
  let score: number | null = null;
  if (def.verify) {
    const result = def.verify(data);
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
      data,
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

/** Owner-only delete. Returns false if the replay doesn't exist; throws on non-owner. */
export async function deleteReplay(id: string, userId: string): Promise<boolean> {
  const replay = await prisma.gameReplay.findUnique({ where: { id }, select: { userId: true } });
  if (!replay) return false;
  if (replay.userId !== userId) throw new ReplayError('FORBIDDEN');
  await prisma.gameReplay.delete({ where: { id } });
  return true;
}

export interface ReplayListItem {
  id: string;
  score: number | null;
  durationMs: number;
  version: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null; handle: string | null };
}

/** Public replays for a game, best score first (uses the `[game, score desc]` index). */
export async function listReplaysForGame(game: string, limit = 20): Promise<ReplayListItem[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const rows = await prisma.gameReplay.findMany({
    where: { game, visibility: 'public' },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take,
    select: {
      id: true,
      score: true,
      durationMs: true,
      version: true,
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
      version: r.version,
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
