/**
 * Scheduled maintenance for the 2026-08-05 batch. Server-only.
 *
 * Registered once from `server/jobs/index.ts` after `getBoss(true)` — the same
 * shape `registerDigestCron` uses, and for the same reason: only the worker's
 * boss instance has `schedule: true`, so the web tier (send-only) cannot
 * schedule anything.
 *
 * Everything here is idempotent and safe to run twice. pg-boss delivers
 * at-least-once, and a maintenance job that corrupts state on a duplicate
 * delivery is a maintenance job that will eventually corrupt state.
 */

import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { drainOutbox, sweepOutbox } from '@/lib/outbox/outbox.server';
import { sweepIdempotencyKeys } from '@/lib/api/idempotency.server';

export const OUTBOX_DRAIN_QUEUE = 'outbox.drain';
export const MAINTENANCE_QUEUE = 'platform.maintenance';
export const RARITY_ROLLUP_QUEUE = 'achievements.rarity';

/**
 * Every minute. The outbox is the delivery path for webhooks and
 * notifications, so its latency is user-visible — a five-minute cron would
 * mean a mention notification arriving five minutes late.
 */
export const OUTBOX_DRAIN_CRON = '* * * * *';
/** Hourly. Sweeps are housekeeping; nothing waits on them. */
export const MAINTENANCE_CRON = '17 * * * *';
/** Nightly at 03:20 UTC — a full-table count, so it goes in the quiet window. */
export const RARITY_ROLLUP_CRON = '20 3 * * *';

/**
 * Recompute achievement rarity (F7).
 *
 * One statement rather than a read-modify-write loop: rarity is a pure
 * aggregate over `UserAchievement`, and computing it in the database avoids
 * pulling every row into Node just to count it. Banned accounts are excluded
 * from the denominator — counting them makes every achievement look rarer than
 * it is, and the number is meant to describe the live population.
 */
export async function rollUpAchievementRarity(): Promise<number> {
  const rows = await prisma.$executeRaw`
    INSERT INTO achievement_rarity ("achievementId", holders, pct, "computedAt")
    SELECT ua."achievementId",
           COUNT(DISTINCT ua."userId")::int,
           COUNT(DISTINCT ua."userId")::float8 / GREATEST((
             SELECT COUNT(*) FROM "user"
             WHERE "bannedUntil" IS NULL OR "bannedUntil" < now()
           ), 1)::float8,
           now()
    FROM "user_achievement" ua
    JOIN "user" u ON u.id = ua."userId"
    WHERE u."bannedUntil" IS NULL OR u."bannedUntil" < now()
    GROUP BY ua."achievementId"
    ON CONFLICT ("achievementId") DO UPDATE
      SET holders = EXCLUDED.holders,
          pct = EXCLUDED.pct,
          "computedAt" = now()
  `;
  return rows;
}

export interface MaintenanceResult {
  idempotencyKeysSwept: number;
  outboxSwept: number;
}

/** Hourly housekeeping. Each step is independent; one failing must not skip the rest. */
export async function runMaintenance(): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { idempotencyKeysSwept: 0, outboxSwept: 0 };
  try {
    result.idempotencyKeysSwept = await sweepIdempotencyKeys();
  } catch (err) {
    console.error('[maintenance] idempotency sweep failed:', (err as Error)?.message);
  }
  try {
    result.outboxSwept = await sweepOutbox();
  } catch (err) {
    console.error('[maintenance] outbox sweep failed:', (err as Error)?.message);
  }
  return result;
}

/**
 * Wire the crons. Called once from the jobs worker.
 *
 * `createQueue` and `schedule` are both idempotent, so a restart re-registering
 * everything is the expected path rather than a special case.
 */
export async function registerMaintenanceCrons(boss: PgBoss): Promise<void> {
  await boss.createQueue(OUTBOX_DRAIN_QUEUE);
  await boss.createQueue(MAINTENANCE_QUEUE);
  await boss.createQueue(RARITY_ROLLUP_QUEUE);

  await boss.schedule(OUTBOX_DRAIN_QUEUE, OUTBOX_DRAIN_CRON, {}, { tz: 'UTC' });
  await boss.schedule(MAINTENANCE_QUEUE, MAINTENANCE_CRON, {}, { tz: 'UTC' });
  await boss.schedule(RARITY_ROLLUP_QUEUE, RARITY_ROLLUP_CRON, {}, { tz: 'UTC' });

  await boss.work(OUTBOX_DRAIN_QUEUE, async () => {
    // Drain repeatedly within the tick while there is still work, so a backlog
    // clears in one minute rather than 50 events per minute.
    for (let pass = 0; pass < 20; pass++) {
      const result = await drainOutbox(50);
      if (result.claimed === 0) break;
    }
  });

  await boss.work(MAINTENANCE_QUEUE, async () => {
    await runMaintenance();
  });

  await boss.work(RARITY_ROLLUP_QUEUE, async () => {
    await rollUpAchievementRarity();
  });
}
