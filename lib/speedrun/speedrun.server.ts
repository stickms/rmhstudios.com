/**
 * Speedrun persistence + the verification pass (design K1).
 *
 * Thin server layer over `SpeedrunCategory` / `SpeedrunEntry`. Every write goes
 * through {@link submitRun}, which is the only correct way to record a run: it
 * resolves the run's board from the REPLAY's version (not from anything the
 * client says), refuses a replay the submitter does not own, and stores the
 * verifier's verdict — including the re-simulated score — rather than a claimed
 * one.
 *
 * The submitted number is never trusted anywhere in this file. `timeMs` comes
 * from `GameReplay.durationMs`, the score comes from the re-simulation when
 * there is one, and the only thing the caller chooses is *which replay* and
 * *which category*.
 *
 * {@link reverifyPending} is the worker entry point — re-running the registry
 * over queued runs after a verifier is added or a version is adopted. It is a
 * plain async function on purpose: wiring it into the pg-boss schedule lives in
 * `server/jobs`, and until then the admin endpoint drains the queue on demand.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import {
  ALL_VERSIONS,
  toSpeedrunMetric,
  toSpeedrunStatus,
  speedrunRejectionMessage,
  type SpeedrunCategoryView,
  type SpeedrunEntryView,
  type SpeedrunMetric,
  type SpeedrunStatus,
} from './types';
import {
  canCaptureRuns,
  getSpeedrunVerifier,
  verificationTierFor,
  verifySpeedrun,
  type SpeedrunVerdict,
} from './verifier';

/** Typed failures so routes map to precise statuses instead of guessing. */
export type SpeedrunErrorCode =
  | 'UNKNOWN_GAME'
  | 'NO_CAPTURE'
  | 'CATEGORY_NOT_FOUND'
  | 'CATEGORY_INACTIVE'
  | 'REPLAY_NOT_FOUND'
  | 'NOT_REPLAY_OWNER'
  | 'GAME_MISMATCH'
  | 'NO_CATEGORY_FOR_VERSION'
  | 'DUPLICATE_RUN'
  | 'ENTRY_NOT_FOUND';

export class SpeedrunError extends Error {
  constructor(public code: SpeedrunErrorCode) {
    super(code);
    this.name = 'SpeedrunError';
  }
}

/** `rejectReason` is `VarChar(200)`; truncate rather than let a write throw. */
const REASON_MAX = 200;
const clampReason = (reason: string) => reason.slice(0, REASON_MAX);

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

const categorySelect = {
  id: true,
  game: true,
  slug: true,
  name: true,
  rules: true,
  metric: true,
  version: true,
  active: true,
} as const;

type CategoryRow = {
  id: string;
  game: string;
  slug: string;
  name: string;
  rules: string;
  metric: string;
  version: string;
  active: boolean;
};

function toCategoryView(row: CategoryRow): SpeedrunCategoryView {
  return {
    id: row.id,
    game: row.game,
    slug: row.slug,
    name: row.name,
    rules: row.rules,
    metric: toSpeedrunMetric(row.metric),
    version: row.version,
    active: row.active,
    // Read from the registry, not stored: the tier is a property of the code
    // that verifies the game, so a row written before a verifier existed must
    // not keep advertising the weaker promise it was created under.
    tier: verificationTierFor(row.game),
  };
}

export async function listCategories(options?: {
  game?: string;
  includeInactive?: boolean;
}): Promise<SpeedrunCategoryView[]> {
  const rows = await prisma.speedrunCategory.findMany({
    where: {
      ...(options?.game ? { game: options.game } : {}),
      ...(options?.includeInactive ? {} : { active: true }),
    },
    orderBy: [{ game: 'asc' }, { slug: 'asc' }, { version: 'desc' }],
    select: categorySelect,
  });
  return rows.map(toCategoryView);
}

export interface UpsertCategoryInput {
  game: string;
  slug: string;
  version: string;
  name: string;
  rules: string;
  metric: SpeedrunMetric;
  active?: boolean;
}

/**
 * Create or update one board. Keyed by `(game, slug, version)` — the same unique
 * key the schema declares — so re-running a seed is idempotent and a new game
 * version means a NEW row rather than an edit that would silently move existing
 * runs onto logic they were not set on.
 */
export async function upsertCategory(input: UpsertCategoryInput): Promise<SpeedrunCategoryView> {
  if (!getSpeedrunVerifier(input.game)) throw new SpeedrunError('UNKNOWN_GAME');

  const row = await prisma.speedrunCategory.upsert({
    where: {
      game_slug_version: { game: input.game, slug: input.slug, version: input.version },
    },
    create: {
      game: input.game,
      slug: input.slug,
      version: input.version,
      name: input.name,
      rules: input.rules,
      metric: input.metric,
      active: input.active ?? true,
    },
    update: {
      name: input.name,
      rules: input.rules,
      metric: input.metric,
      ...(input.active === undefined ? {} : { active: input.active }),
    },
    select: categorySelect,
  });
  return toCategoryView(row);
}

/* -------------------------------------------------------------------------- */
/* Boards                                                                     */
/* -------------------------------------------------------------------------- */

const entrySelect = {
  id: true,
  categoryId: true,
  replayId: true,
  timeMs: true,
  score: true,
  status: true,
  rejectReason: true,
  verifiedAt: true,
  createdAt: true,
  category: { select: { version: true } },
  user: { select: userDisplaySelect },
} as const;

type EntryRow = {
  id: string;
  categoryId: string;
  replayId: string;
  timeMs: number;
  score: number | null;
  status: string;
  rejectReason: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  category: { version: string };
  user: Parameters<typeof resolveUserDisplay>[0] & { id: string; handle: string | null };
};

function toEntryView(row: EntryRow): SpeedrunEntryView {
  const display = resolveUserDisplay(row.user);
  return {
    id: row.id,
    categoryId: row.categoryId,
    version: row.category.version,
    replayId: row.replayId,
    timeMs: row.timeMs,
    score: row.score,
    status: toSpeedrunStatus(row.status),
    rejectReason: row.rejectReason,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    runner: {
      id: row.user.id,
      name: display.name,
      image: display.image,
      handle: row.user.handle ?? null,
    },
  };
}

export interface BoardResult {
  /** Every version of this slug that has a board, newest first. */
  categories: SpeedrunCategoryView[];
  metric: SpeedrunMetric;
  entries: SpeedrunEntryView[];
}

/**
 * One slug's board(s).
 *
 * `version: 'all'` returns every version's runs in one list — each carrying its
 * own `version` so the UI can label them. It does NOT merge them into a single
 * ranking; `buildBoard` in `./versions` does the bucketing, and it is shared with
 * the client so both sides rank identically.
 *
 * Runs of every status travel, not just verified ones: a runner has to be able to
 * see their own run sitting in the queue, and a board that hides its rejections
 * is a board nobody can audit.
 */
export async function getBoard(options: {
  game: string;
  slug: string;
  version?: string;
  limit?: number;
}): Promise<BoardResult> {
  const version = options.version ?? ALL_VERSIONS;
  const take = Math.min(Math.max(Math.trunc(options.limit ?? 50) || 50, 1), 200);

  const categoryRows = await prisma.speedrunCategory.findMany({
    where: {
      game: options.game,
      slug: options.slug,
      ...(version === ALL_VERSIONS ? {} : { version }),
    },
    orderBy: { version: 'desc' },
    select: categorySelect,
  });
  if (categoryRows.length === 0) throw new SpeedrunError('CATEGORY_NOT_FOUND');

  const categories = categoryRows.map(toCategoryView);
  const metric = categories[0].metric;

  const rows = await prisma.speedrunEntry.findMany({
    where: { categoryId: { in: categories.map((c) => c.id) } },
    // The `(categoryId, status, timeMs)` index orders this; the exact ranking
    // (metric-aware, tie-broken) is applied by `rankEntries` on both sides.
    orderBy: metric === 'score' ? [{ score: 'desc' }, { timeMs: 'asc' }] : [{ timeMs: 'asc' }],
    take: take * categories.length,
    select: entrySelect,
  });

  return { categories, metric, entries: rows.map(toEntryView) };
}

/** Runs awaiting a human verdict, oldest first — the manual queue. */
export async function getPendingQueue(limit = 50): Promise<SpeedrunEntryView[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const rows = await prisma.speedrunEntry.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take,
    select: entrySelect,
  });
  return rows.map(toEntryView);
}

/** A runner's own runs, newest first. */
export async function getRunsForUser(userId: string, limit = 20): Promise<SpeedrunEntryView[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const rows = await prisma.speedrunEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: entrySelect,
  });
  return rows.map(toEntryView);
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                 */
/* -------------------------------------------------------------------------- */

export interface SubmittableReplay {
  id: string;
  version: string;
  score: number | null;
  durationMs: number;
  createdAt: string;
}

/**
 * The runner's own replays for a game that have not been submitted yet.
 *
 * `SpeedrunEntry.replayId` is unique but is not a relation (a replay outlives
 * the run it backed), so the "already submitted" half is a second query rather
 * than a join — bounded by the page size, which is why it stays cheap.
 */
export async function listSubmittableReplays(
  userId: string,
  game: string,
  limit = 20,
): Promise<SubmittableReplay[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
  const replays = await prisma.gameReplay.findMany({
    where: { userId, game },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, version: true, score: true, durationMs: true, createdAt: true },
  });
  if (replays.length === 0) return [];

  const used = await prisma.speedrunEntry.findMany({
    where: { replayId: { in: replays.map((r) => r.id) } },
    select: { replayId: true },
  });
  const usedIds = new Set(used.map((u) => u.replayId));

  return replays
    .filter((r) => !usedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      version: r.version,
      score: r.score,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    }));
}

export interface SubmitRunInput {
  userId: string;
  game: string;
  slug: string;
  replayId: string;
}

export interface SubmitRunResult {
  entry: SpeedrunEntryView;
  verdict: SpeedrunVerdict;
}

export async function submitRun(input: SubmitRunInput): Promise<SubmitRunResult> {
  const verifier = getSpeedrunVerifier(input.game);
  if (!verifier) throw new SpeedrunError('UNKNOWN_GAME');
  // A run IS a replay. A game with no capture contract has nothing to point at,
  // so refuse it here rather than letting someone create an entry that can never
  // be verified because there is no log to re-simulate.
  if (!canCaptureRuns(input.game)) throw new SpeedrunError('NO_CAPTURE');

  const replay = await prisma.gameReplay.findUnique({
    where: { id: input.replayId },
    select: {
      id: true,
      userId: true,
      game: true,
      version: true,
      score: true,
      durationMs: true,
      data: true,
    },
  });
  if (!replay) throw new SpeedrunError('REPLAY_NOT_FOUND');
  // You may only submit your own run. Without this, anyone could farm someone
  // else's public replay onto their own name.
  if (replay.userId !== input.userId) throw new SpeedrunError('NOT_REPLAY_OWNER');
  if (replay.game !== input.game) throw new SpeedrunError('GAME_MISMATCH');

  // The board is chosen by the REPLAY's version, never by the client: that is
  // what makes "leaderboards are per game version" true rather than advisory.
  const category = await prisma.speedrunCategory.findUnique({
    where: {
      game_slug_version: { game: input.game, slug: input.slug, version: replay.version },
    },
    select: categorySelect,
  });
  if (!category) throw new SpeedrunError('NO_CATEGORY_FOR_VERSION');
  if (!category.active) throw new SpeedrunError('CATEGORY_INACTIVE');

  const existing = await prisma.speedrunEntry.findUnique({
    where: { replayId: replay.id },
    select: { id: true },
  });
  if (existing) throw new SpeedrunError('DUPLICATE_RUN');

  const metric = toSpeedrunMetric(category.metric);
  const verdict = verifySpeedrun({
    game: input.game,
    version: replay.version,
    data: replay.data,
    claim: { timeMs: replay.durationMs, score: replay.score, metric },
  });

  const row = await prisma.speedrunEntry.create({
    data: {
      categoryId: category.id,
      userId: input.userId,
      replayId: replay.id,
      timeMs: replay.durationMs,
      // The re-simulated score wins over the stored one wherever a simulation
      // ran — the whole point of re-deriving it.
      score: verdict.derivedScore ?? replay.score,
      status: verdict.status,
      rejectReason: verdict.reason ? clampReason(speedrunRejectionMessage(verdict.reason)) : null,
      verifiedAt: verdict.status === 'verified' ? new Date() : null,
    },
    select: entrySelect,
  });

  return { entry: toEntryView(row), verdict };
}

/* -------------------------------------------------------------------------- */
/* Re-verification + manual review                                            */
/* -------------------------------------------------------------------------- */

export interface ReverifyResult {
  checked: number;
  verified: number;
  rejected: number;
  stillPending: number;
}

/**
 * Re-run the registry over queued runs.
 *
 * The queue is not static: a game adopts a capture contract, a verifier gains a
 * version, a `consistency` game graduates to `deterministic`. Re-running the
 * pass is how those runs get their verdict without a re-submission — and it is
 * safe to run repeatedly, because the verifier is pure and a run whose verdict
 * does not change is written back only when it actually changes.
 */
export async function reverifyPending(limit = 50): Promise<ReverifyResult> {
  const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const rows = await prisma.speedrunEntry.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      id: true,
      timeMs: true,
      score: true,
      category: { select: { game: true, metric: true } },
      replayId: true,
    },
  });

  const result: ReverifyResult = { checked: 0, verified: 0, rejected: 0, stillPending: 0 };
  if (rows.length === 0) return result;

  const replays = await prisma.gameReplay.findMany({
    where: { id: { in: rows.map((r) => r.replayId) } },
    select: { id: true, version: true, data: true, score: true, durationMs: true },
  });
  const byId = new Map(replays.map((r) => [r.id, r]));

  for (const row of rows) {
    const replay = byId.get(row.replayId);
    result.checked++;
    if (!replay) {
      // The replay is gone (owner deleted it), so the run can never be checked.
      result.rejected++;
      await prisma.speedrunEntry.update({
        where: { id: row.id },
        data: {
          status: 'rejected',
          rejectReason: clampReason('The replay this run points at no longer exists.'),
        },
      });
      continue;
    }

    const verdict = verifySpeedrun({
      game: row.category.game,
      version: replay.version,
      data: replay.data,
      claim: {
        timeMs: replay.durationMs,
        score: replay.score,
        metric: toSpeedrunMetric(row.category.metric),
      },
    });

    if (verdict.status === 'pending') {
      result.stillPending++;
      continue;
    }

    if (verdict.status === 'verified') result.verified++;
    else result.rejected++;

    await prisma.speedrunEntry.update({
      where: { id: row.id },
      data: {
        status: verdict.status,
        score: verdict.derivedScore ?? row.score,
        rejectReason: verdict.reason ? clampReason(speedrunRejectionMessage(verdict.reason)) : null,
        verifiedAt: verdict.status === 'verified' ? new Date() : null,
      },
    });
  }

  return result;
}

/**
 * An admin's verdict on a queued run.
 *
 * Manual review exists precisely for the runs automation cannot settle, so this
 * records WHY in `rejectReason` even on an approval — a board whose top entry was
 * approved by hand should say so.
 */
export async function reviewEntry(input: {
  entryId: string;
  status: Extract<SpeedrunStatus, 'verified' | 'rejected'>;
  reason?: string;
}): Promise<SpeedrunEntryView> {
  const existing = await prisma.speedrunEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true },
  });
  if (!existing) throw new SpeedrunError('ENTRY_NOT_FOUND');

  const row = await prisma.speedrunEntry.update({
    where: { id: input.entryId },
    data: {
      status: input.status,
      rejectReason: input.reason ? clampReason(input.reason) : null,
      verifiedAt: input.status === 'verified' ? new Date() : null,
    },
    select: entrySelect,
  });
  return toEntryView(row);
}
