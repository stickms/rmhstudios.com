/**
 * X8 · Post expiry & auto-delete — server side.
 *
 * Two independent ways a post leaves the site on its own, both ending in the
 * existing recycle-bin soft delete (`softDeletePostAsAuthor`, stamped
 * `deletedBy: 'author'`) so the author can still restore it from /trash:
 *
 *  1. **Per-post TTL** (1h / 24h / 7d, chosen at compose). `rmheet.expiresAt` is
 *     the read-time hint every reader applies, so an expired post is invisible
 *     the moment it expires; `post_lifecycle` is the indexed table the sweep job
 *     scans to actually delete it.
 *  2. **Account auto-delete** ("older than N months"), a daily job over opted-in
 *     accounts in bounded batches. It never touches a pinned post, a post the
 *     owner has bookmarked, or one they restored from the bin (`keepForever`).
 */

import type { Prisma } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { softDeletePostAsAuthor } from '@/lib/trash/trash.server';
import type { AutoDeleteMonths } from './constants';

/* --------------------------------- TTL ----------------------------------- */

/** Inside the post-create transaction. */
export async function recordExpiryTx(
  tx: Prisma.TransactionClient,
  postId: string,
  userId: string,
  expiresAt: Date,
): Promise<void> {
  await tx.postLifecycle.create({ data: { postId, userId, expiresAt } });
}

const EXPIRY_BATCH = 100;
const EXPIRY_MAX_BATCHES = 20;

export interface SweepResult {
  deleted: number;
  skipped: number;
}

/** Soft-delete every post whose TTL has passed, in bounded batches. Safe to run twice. */
export async function sweepExpiredPosts(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = { deleted: 0, skipped: 0 };
  for (let i = 0; i < EXPIRY_MAX_BATCHES; i++) {
    const due = await prisma.postLifecycle.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: EXPIRY_BATCH,
      select: { postId: true, userId: true },
    });
    if (due.length === 0) break;
    for (const row of due) {
      try {
        const outcome = await softDeletePostAsAuthor(row.userId, row.postId, now);
        if (outcome === 'deleted') result.deleted++;
        else result.skipped++;
      } catch (e) {
        result.skipped++;
        console.error('[expiry] delete failed:', row.postId, (e as Error)?.message);
      }
    }
    // The lifecycle row has done its job once the post is in the bin.
    await prisma.postLifecycle.deleteMany({
      where: { postId: { in: due.map((d) => d.postId) }, expiresAt: { lte: now } },
    });
    if (due.length < EXPIRY_BATCH) break;
  }
  return result;
}

/* ----------------------------- auto-delete ------------------------------- */

export interface AutoDeleteSetting {
  months: AutoDeleteMonths | null;
  lastRunAt: string | null;
}

export async function getAutoDelete(userId: string): Promise<AutoDeleteSetting> {
  const row = await prisma.postAutoDelete.findUnique({ where: { userId } });
  return {
    months: (row?.months as AutoDeleteMonths | undefined) ?? null,
    lastRunAt: row?.lastRunAt?.toISOString() ?? null,
  };
}

export async function setAutoDelete(userId: string, months: AutoDeleteMonths | null) {
  if (months === null) {
    await prisma.postAutoDelete.deleteMany({ where: { userId } });
    return;
  }
  await prisma.postAutoDelete.upsert({
    where: { userId },
    create: { userId, months },
    // A changed window should be applied at the next run, not 20 hours after it.
    update: { months, lastRunAt: null },
  });
}

export function autoDeleteCutoff(months: number, now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * Candidate posts for one account, oldest first. A single statement so the three
 * exclusions (pinned, bookmarked by the owner, restored) are evaluated by the
 * database against the `(userId, createdAt)` index rather than paged through Node.
 */
export async function findAutoDeleteCandidates(
  userId: string,
  cutoff: Date,
  limit: number,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "rmheet" p
    WHERE p."userId" = ${userId}
      AND p."deletedAt" IS NULL
      AND p."pinnedAt" IS NULL
      AND p."createdAt" < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "saved_item" s
        WHERE s."userId" = ${userId} AND s."entityType" = 'rmhark' AND s."entityId" = p."id")
      AND NOT EXISTS (
        SELECT 1 FROM "rmheet_bookmark" b
        WHERE b."userId" = ${userId} AND b."rmheetId" = p."id")
      AND NOT EXISTS (
        SELECT 1 FROM "post_lifecycle" l
        WHERE l."postId" = p."id" AND l."keepForever")
    ORDER BY p."createdAt" ASC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** How many posts the setting would take right now (shown before the member opts in). */
export async function countAutoDeleteCandidates(userId: string, months: number): Promise<number> {
  const cutoff = autoDeleteCutoff(months);
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT p."id" FROM "rmheet" p
      WHERE p."userId" = ${userId}
        AND p."deletedAt" IS NULL AND p."pinnedAt" IS NULL AND p."createdAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "saved_item" s
          WHERE s."userId" = ${userId} AND s."entityType" = 'rmhark' AND s."entityId" = p."id")
        AND NOT EXISTS (
          SELECT 1 FROM "rmheet_bookmark" b
          WHERE b."userId" = ${userId} AND b."rmheetId" = p."id")
        AND NOT EXISTS (
          SELECT 1 FROM "post_lifecycle" l WHERE l."postId" = p."id" AND l."keepForever")
      LIMIT 1000) c`;
  return Number(rows[0]?.n ?? 0);
}

const USERS_PER_RUN = 100;
const POSTS_PER_BATCH = 100;
const BATCHES_PER_USER = 5;
/** A run must not outlive its schedule slot no matter how much work there is. */
const RUN_BUDGET_MS = 4 * 60_000;

export interface AutoDeleteRunResult {
  users: number;
  deleted: number;
}

/** The daily job. Idempotent: a second run the same day finds nothing new to take. */
export async function runAutoDelete(now: Date = new Date()): Promise<AutoDeleteRunResult> {
  const started = Date.now();
  const result: AutoDeleteRunResult = { users: 0, deleted: 0 };
  const settings = await prisma.postAutoDelete.findMany({
    where: {
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - 20 * 3_600_000) } }],
    },
    orderBy: { lastRunAt: { sort: 'asc', nulls: 'first' } },
    take: USERS_PER_RUN,
    select: { userId: true, months: true },
  });
  for (const s of settings) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    const cutoff = autoDeleteCutoff(s.months, now);
    let drained = true;
    for (let b = 0; b < BATCHES_PER_USER; b++) {
      const ids = await findAutoDeleteCandidates(s.userId, cutoff, POSTS_PER_BATCH);
      for (const id of ids) {
        try {
          if ((await softDeletePostAsAuthor(s.userId, id, now)) === 'deleted') result.deleted++;
        } catch (e) {
          console.error('[auto-delete] failed:', id, (e as Error)?.message);
        }
      }
      if (ids.length < POSTS_PER_BATCH) break;
      if (b === BATCHES_PER_USER - 1) drained = false;
    }
    // A backlog bigger than one run's budget keeps its place at the front of the
    // line (lastRunAt stays null) instead of waiting a full day for the rest.
    await prisma.postAutoDelete.updateMany({
      where: { userId: s.userId },
      data: { lastRunAt: drained ? now : null },
    });
    result.users++;
  }
  return result;
}

/* --------------------------------- cron ---------------------------------- */

export const POST_EXPIRY_QUEUE = 'posts.expire';
export const POST_AUTO_DELETE_QUEUE = 'posts.auto-delete';
/** Every five minutes: the read-time rule makes latency invisible, this just reclaims rows. */
export const POST_EXPIRY_CRON = '*/5 * * * *';
/** Daily at 03:50 UTC, in the quiet window. */
export const POST_AUTO_DELETE_CRON = '50 3 * * *';

export async function registerLifecycleCrons(boss: PgBoss): Promise<void> {
  await boss.createQueue(POST_EXPIRY_QUEUE);
  await boss.createQueue(POST_AUTO_DELETE_QUEUE);
  await boss.schedule(POST_EXPIRY_QUEUE, POST_EXPIRY_CRON, {}, { tz: 'UTC' });
  await boss.schedule(POST_AUTO_DELETE_QUEUE, POST_AUTO_DELETE_CRON, {}, { tz: 'UTC' });
  await boss.work(POST_EXPIRY_QUEUE, async () => {
    await sweepExpiredPosts();
  });
  await boss.work(POST_AUTO_DELETE_QUEUE, async () => {
    await runAutoDelete();
  });
}
