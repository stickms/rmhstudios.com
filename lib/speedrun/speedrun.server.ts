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
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { games } from '@/lib/catalog';
import { userNotHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
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
  | 'ENTRY_NOT_FOUND'
  | 'ALREADY_DECIDED';

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

  // The public board leaves hidden members out before `take` (a member's own runs are `getRunsForUser`).
  const hidden = await leaderboardHiddenUserIds();
  const rows = await prisma.speedrunEntry.findMany({
    where: { categoryId: { in: categories.map((c) => c.id) }, ...userNotHiddenWhere(hidden) },
    // The `(categoryId, status, timeMs)` index orders this; the exact ranking
    // (metric-aware, tie-broken) is applied by `rankEntries` on both sides.
    orderBy: metric === 'score' ? [{ score: 'desc' }, { timeMs: 'asc' }] : [{ timeMs: 'asc' }],
    take: take * categories.length,
    select: entrySelect,
  });

  // `rejectReason` is admin-written text about a member and this response is public and cached: it never travels
  // here. A runner reads their own reason from `getRunsForUser` (`GET /api/speedrun/runs`).
  return { categories, metric, entries: rows.map((row) => ({ ...toEntryView(row), rejectReason: null })) };
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

/** Where a batch stopped, oldest first by `(createdAt, id)`: the next batch starts after it. */
export interface ReverifyCursor {
  createdAt: Date;
  id: string;
}

/** The notification's entity type; one label ("Speedrun verdict") covers both notice keys. */
export const SPEEDRUN_VERDICT_ENTITY = 'speedrun-verdict';

/** The game's title for a notice; the id when the catalog does not know it. Member-independent plain text. */
function gameTitle(game: string): string {
  return games.find((g) => g.id === game)?.title ?? game;
}

/**
 * Tell the runner what happened to their run: the `notice()` keys of the inbox. Best-effort and called only by the
 * writer whose compare-and-set won, so a verdict is announced once. A failed notification never undoes the verdict.
 */
async function notifyRunner(entry: {
  id: string;
  userId: string;
  status: 'verified' | 'rejected';
  reason: string | null;
  game: string;
}): Promise<void> {
  const game = gameTitle(entry.game);
  try {
    await createNotification({
      userId: entry.userId,
      type: 'SYSTEM',
      entityType: SPEEDRUN_VERDICT_ENTITY,
      entityId: `${entry.id}:${entry.status}`,
      preview:
        entry.status === 'verified'
          ? notice('speedrun-run-verified', { game })
          : notice('speedrun-run-rejected', { game, reason: entry.reason ?? 'No reason was given.' }),
      link: '/compete',
    });
  } catch (error) {
    console.error('[speedrun] could not notify the runner', error);
  }
}

/**
 * Re-run the registry over queued runs.
 *
 * The queue is not static: a game adopts a capture contract, a verifier gains a
 * version, a `consistency` game graduates to `deterministic`. Re-running the
 * pass is how those runs get their verdict without a re-submission — and it is
 * safe to run repeatedly, because the verifier is pure and a run whose verdict
 * does not change is written back only when it actually changes. A run that DOES
 * change tells its runner, once: the write is a compare-and-set on `pending`, and
 * only the pass that won it notifies.
 */
export async function reverifyPending(
  limit = 50,
  after?: ReverifyCursor,
): Promise<ReverifyResult & { last: ReverifyCursor | null }> {
  const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const rows = await prisma.speedrunEntry.findMany({
    // `after` lets the nightly job walk past runs that legitimately stay pending instead of re-reading them.
    where: after
      ? {
          status: 'pending',
          OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }],
        }
      : { status: 'pending' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take,
    select: {
      id: true,
      userId: true,
      createdAt: true,
      timeMs: true,
      score: true,
      category: { select: { game: true, metric: true } },
      replayId: true,
    },
  });

  const result: ReverifyResult & { last: ReverifyCursor | null } = {
    checked: 0,
    verified: 0,
    rejected: 0,
    stillPending: 0,
    last: null,
  };
  if (rows.length === 0) return result;
  const tail = rows[rows.length - 1];
  if (tail) result.last = { createdAt: tail.createdAt, id: tail.id };

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
      // Conditional on still pending: an admin verdict that landed while the
      // sweep ran is never overwritten by automation.
      const reason = clampReason('The replay this run points at no longer exists.');
      const { count } = await prisma.speedrunEntry.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'rejected', rejectReason: reason },
      });
      if (count > 0) {
        result.rejected++;
        await notifyRunner({ id: row.id, userId: row.userId, status: 'rejected', reason, game: row.category.game });
      }
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

    const reason = verdict.reason ? clampReason(speedrunRejectionMessage(verdict.reason)) : null;
    const { count } = await prisma.speedrunEntry.updateMany({
      // CAS on 'pending' (see above): the sweep never overrides a human.
      where: { id: row.id, status: 'pending' },
      data: {
        status: verdict.status,
        score: verdict.derivedScore ?? row.score,
        rejectReason: reason,
        verifiedAt: verdict.status === 'verified' ? new Date() : null,
      },
    });
    if (count === 0) continue;
    if (verdict.status === 'verified') result.verified++;
    else result.rejected++;
    await notifyRunner({ id: row.id, userId: row.userId, status: verdict.status, reason, game: row.category.game });
  }

  return result;
}

/** Who gave a verdict, as the page shows it: a display name, or null for the automatic pass. */
export interface Decider {
  id: string;
  name: string | null;
}

async function resolveDeciders(ids: readonly (string | null)[]): Promise<Map<string, Decider>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  const out = new Map<string, Decider>();
  if (unique.length === 0) return out;
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: userDisplaySelect });
  for (const u of Array.isArray(users) ? users : []) {
    out.set(u.id, { id: u.id, name: resolveUserDisplay(u).name });
  }
  return out;
}

export type ReviewResult =
  | { ok: true; entry: SpeedrunEntryView }
  | { ok: false; code: 'ALREADY_DECIDED'; status: SpeedrunStatus; decidedBy: Decider | null };

const verdictAction = (status: 'verified' | 'rejected') => (status === 'verified' ? 'speedrun.verify' : 'speedrun.reject');

/**
 * An admin's verdict on a queued run.
 *
 * It applies only while the run is still `pending` (a compare-and-set, so two admins never overwrite each other and a
 * verdict never overwrites an automatic one); the loser is told who decided. The change and its audit row are one
 * transaction. Manual review exists precisely for the runs automation cannot settle, so this records WHY in
 * `rejectReason` even on an approval — a board whose top entry was approved by hand should say so. Only the writer
 * that won the compare-and-set tells the runner.
 *
 * To reverse a verdict, {@link reopenEntry} puts the run back in the queue first.
 */
export async function reviewEntry(input: {
  entryId: string;
  status: Extract<SpeedrunStatus, 'verified' | 'rejected'>;
  reason?: string | undefined;
  adminId: string;
}): Promise<ReviewResult> {
  const reason = input.reason ? clampReason(input.reason) : null;
  const now = new Date();
  const won = await prisma.$transaction(async (tx) => {
    const { count } = await tx.speedrunEntry.updateMany({
      where: { id: input.entryId, status: 'pending' },
      data: {
        status: input.status,
        rejectReason: reason,
        verifiedAt: input.status === 'verified' ? now : null,
        reviewedById: input.adminId,
        reviewedAt: now,
      },
    });
    if (count === 0) return false;
    await recordAdminActionIn(tx, input.adminId, verdictAction(input.status), {
      targetType: 'speedrun_entry',
      targetId: input.entryId,
      detail: reason ? `${input.status}: ${reason}` : input.status,
    });
    return true;
  });

  if (!won) {
    const existing = await prisma.speedrunEntry.findUnique({
      where: { id: input.entryId },
      select: { status: true, reviewedById: true },
    });
    if (!existing) throw new SpeedrunError('ENTRY_NOT_FOUND');
    const deciders = await resolveDeciders([existing.reviewedById]);
    return {
      ok: false,
      code: 'ALREADY_DECIDED',
      status: toSpeedrunStatus(existing.status),
      decidedBy: existing.reviewedById ? (deciders.get(existing.reviewedById) ?? { id: existing.reviewedById, name: null }) : null,
    };
  }

  const row = await prisma.speedrunEntry.findUnique({
    where: { id: input.entryId },
    select: { ...entrySelect, userId: true, category: { select: { version: true, game: true } } },
  });
  if (!row) throw new SpeedrunError('ENTRY_NOT_FOUND');
  await notifyRunner({
    id: row.id,
    userId: row.userId,
    status: input.status,
    reason,
    game: row.category.game,
  });
  return { ok: true, entry: toEntryView(row) };
}

export type ReopenResult =
  | { ok: true }
  | { ok: false; code: 'STATUS_CHANGED'; status: SpeedrunStatus };

/**
 * Put a decided run back in the queue (the way an admin reverses a verification once cheating comes to light).
 *
 * A compare-and-set from the status the admin saw (`from`) back to `pending`, audited in the same transaction with the
 * reason. The runner is not told: they hear only of the verdict that follows.
 */
export async function reopenEntry(input: {
  entryId: string;
  from: Extract<SpeedrunStatus, 'verified' | 'rejected'>;
  reason: string;
  adminId: string;
}): Promise<ReopenResult> {
  const reason = clampReason(input.reason);
  const reopened = await prisma.$transaction(async (tx) => {
    const { count } = await tx.speedrunEntry.updateMany({
      where: { id: input.entryId, status: input.from },
      data: { status: 'pending', rejectReason: null, verifiedAt: null, reviewedById: null, reviewedAt: null },
    });
    if (count === 0) return false;
    await recordAdminActionIn(tx, input.adminId, 'speedrun.reopen', {
      targetType: 'speedrun_entry',
      targetId: input.entryId,
      detail: `was ${input.from}: ${reason}`,
    });
    return true;
  });
  if (reopened) return { ok: true };

  const existing = await prisma.speedrunEntry.findUnique({ where: { id: input.entryId }, select: { status: true } });
  if (!existing) throw new SpeedrunError('ENTRY_NOT_FOUND');
  return { ok: false, code: 'STATUS_CHANGED', status: toSpeedrunStatus(existing.status) };
}
