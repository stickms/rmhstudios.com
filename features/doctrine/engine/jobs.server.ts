/**
 * Doctrine Engine background jobs (D3: ported from the Go worker
 * `internal/doctrine`). Server-only; runs in the `jobs` worker as pg-boss crons.
 *
 *   doctrine.daily-puzzles      00:00 UTC (+ once at boot): tomorrow's puzzles, all six modes.
 *   doctrine.sahur-activation   every minute: open a Sahur session for each timezone at 03:xx.
 *   doctrine.reputation-decay   hourly on Mondays (UTC): -5% XP for players inactive > 7 days.
 *
 * On-call: the status service reads `doctrine.sahur-activation` freshness (B06
 * `sahur_activation`, 10 min) from pg-boss's job table, and A19 ("tomorrow's
 * daily puzzles missing", after 00:15 UTC) straight from `doctrine_puzzle`
 * (go-services/cmd/status/dbprobe.go), so neither depends on this worker's metrics.
 *
 * Behaviour change vs the Go worker (deliberate): the five regular modes store
 * the generated puzzle content (`generatePuzzle`, the same call the
 * /api/doctrine/puzzles/today fallback makes). The Go copy wrote a
 * `{generated, seed}` stub that the API then served as if it were a puzzle.
 * SAHUR_SPECIAL has no generator in the engine, so it keeps the stub.
 */
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { WEEKLY_DECAY_RATE } from './constants';
import { generatePuzzle, getDifficulty, getSeedForDate } from './puzzle-engine';
import { isSahurActive } from './temporal';
import type { PuzzleMode } from './types';

export const DOCTRINE_PUZZLES_QUEUE = 'doctrine.daily-puzzles';
export const DOCTRINE_SAHUR_QUEUE = 'doctrine.sahur-activation';
export const DOCTRINE_DECAY_QUEUE = 'doctrine.reputation-decay';

/** The regular daily modes, in the Go/Node order. SAHUR_SPECIAL is generated separately. */
export const REGULAR_MODES = ['ALIBI', 'SPECTRUM', 'OUTCAST', 'CHAINLINK', 'IMPOSTOR'] as const;
export type RegularMode = (typeof REGULAR_MODES)[number];
export const SAHUR_SPECIAL_MODE = 'SAHUR_SPECIAL' as const;

/** UTC midnight daily; the A19 alarm allows until 00:15. */
export const DAILY_PUZZLES_CRON = '0 0 * * *';
/** pg-boss cron has one-minute granularity, the Go ticker's 60 s. */
export const SAHUR_CRON = '* * * * *';
/** Every hour on Mondays (UTC); the weekly dedupe in SQL makes extra runs harmless. */
export const DECAY_CRON = '41 * * * 1';

/** How long the distinct-timezone list may be reused (the scan is a DISTINCT over "user"). */
export const TZ_LIST_TTL_MS = 10 * 60 * 1000;

// ─── pure helpers ───────────────────────────────────────────────────────────

/** YYYY-MM-DD (UTC) of the day after `now`. */
export function tomorrowKey(now: Date): string {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return t.toISOString().slice(0, 10);
}

/** SAHUR_SPECIAL difficulty: min(5, base + 1). */
export function sahurDifficulty(base: number): number {
  return Math.min(5, base + 1);
}

/** floor(xp * (1 - rate)); xp is non-negative so this equals the Go int truncation. */
export function decayedXp(totalXp: number): number {
  return Math.floor(totalXp * (1 - WEEKLY_DECAY_RATE));
}

export const DECAY_REASON = 'Weekly inactivity decay (-5%)';

// ─── Job 1: daily puzzles ───────────────────────────────────────────────────

interface PuzzleDb {
  doctrinePuzzle: {
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}

/** Create tomorrow's puzzles that do not exist yet. Returns the modes created. */
export async function generateDailyPuzzles(
  now: Date = new Date(),
  db: PuzzleDb = prisma as unknown as PuzzleDb,
): Promise<string[]> {
  const dateStr = tomorrowKey(now);
  const date = new Date(`${dateStr}T00:00:00Z`);
  const resetsAt = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const created: string[] = [];

  const exists = async (mode: string) =>
    (await db.doctrinePuzzle.findUnique({ where: { mode_date: { mode, date } } })) != null;
  const insert = async (
    mode: string,
    data: object,
    seed: number,
    difficulty: number,
    isSahur: boolean,
  ) => {
    try {
      await db.doctrinePuzzle.create({
        data: { mode, date, seed, data, difficulty, resetsAt, isSahur },
      });
      created.push(mode);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // another runner won the race: fine
    }
  };

  for (const mode of REGULAR_MODES) {
    if (await exists(mode)) continue;
    const lower = mode.toLowerCase() as PuzzleMode;
    const seed = getSeedForDate(dateStr, lower);
    const puzzle = generatePuzzle(lower, seed, dateStr);
    await insert(mode, puzzle.content as object, seed, puzzle.difficulty, false);
  }

  if (!(await exists(SAHUR_SPECIAL_MODE))) {
    const seed = getSeedForDate(dateStr, 'sahur_special');
    await insert(
      SAHUR_SPECIAL_MODE,
      { generated: true, seed },
      seed,
      sahurDifficulty(getDifficulty(dateStr)),
      true,
    );
  }
  return created;
}

// ─── Job 2: Sahur activation ────────────────────────────────────────────────

let tzCache: { at: number; list: string[] } | null = null;

/** Reset the timezone cache (tests). */
export function resetTimezoneCache(): void {
  tzCache = null;
}

async function distinctTimezones(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ doctrineTimezone: string }[]>(
    Prisma.sql`SELECT DISTINCT "doctrineTimezone" FROM "user" WHERE "doctrineTimezone" IS NOT NULL`,
  );
  return rows.map((r) => r.doctrineTimezone);
}

export interface SahurDeps {
  timezones?: () => Promise<string[]>;
  sessionExists?: (dateKey: string, timezone: string) => Promise<boolean>;
  createSession?: (dateKey: string, timezone: string) => Promise<void>;
  log?: Pick<Console, 'info'>;
}

/** Open a doctrine_sahur_session for (today, tz) for every timezone currently at 03:xx. */
export async function checkSahurActivation(
  now: Date = new Date(),
  deps: SahurDeps = {},
): Promise<string[]> {
  let list: string[];
  if (deps.timezones) {
    list = await deps.timezones();
  } else if (tzCache && now.getTime() - tzCache.at < TZ_LIST_TTL_MS) {
    list = tzCache.list;
  } else {
    list = await distinctTimezones();
    tzCache = { at: now.getTime(), list };
  }
  const exists =
    deps.sessionExists ??
    (async (dateKey: string, timezone: string) =>
      (await prisma.doctrineSahurSession.findUnique({
        where: { dateKey_timezone: { dateKey, timezone } },
        select: { id: true },
      })) != null);
  const create =
    deps.createSession ??
    (async (dateKey: string, timezone: string) => {
      await prisma.doctrineSahurSession.create({ data: { dateKey, timezone } });
    });

  const today = now.toISOString().slice(0, 10);
  const activated: string[] = [];
  for (const tz of list) {
    if (!tz || !isSahurActive(tz, now)) continue;
    if (await exists(today, tz)) continue;
    try {
      await create(today, tz);
      activated.push(tz);
      (deps.log ?? console).info(`[doctrine] activated sahur timezone=${tz}`);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return activated;
}

// ─── Job 3: weekly reputation decay ─────────────────────────────────────────

/** Excludes a reputation already decayed this ISO week (Postgres weeks start Monday). */
const notDecayedThisWeek = Prisma.sql`NOT EXISTS (SELECT 1 FROM "doctrine_reputation_ledger" l
  WHERE l."reputationId" = r."id" AND l."action" = 'WEEKLY_DECAY'
  AND l."createdAt" >= date_trunc('week', now()))`;

/**
 * Decay totalXp by 5% for reputations inactive for more than 7 days, with a
 * WEEKLY_DECAY ledger row each, in ONE transaction. The update is conditional on
 * the total still being the one read, so an XP award landing in between is never
 * overwritten (that row is skipped and gets no ledger row). Returns the count decayed.
 */
export async function applyReputationDecay(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const reps = await prisma.$queryRaw<{ id: string; totalXp: number }[]>(
    Prisma.sql`SELECT r."id", r."totalXp" FROM "doctrine_reputation" r
      WHERE r."lastActiveAt" < ${cutoff} AND r."totalXp" > 0 AND ${notDecayedThisWeek}`,
  );
  if (reps.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    // One row per rep: (id, new total, old total).
    const values = Prisma.join(
      reps.map((r) => Prisma.sql`(${r.id}, ${decayedXp(r.totalXp)}::int, ${r.totalXp}::int)`),
    );
    const updated = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "doctrine_reputation" r SET "totalXp" = t.xp
      FROM (VALUES ${values}) AS t(id, xp, old)
      WHERE r."id" = t.id AND r."totalXp" = t.old AND ${notDecayedThisWeek}
      RETURNING r."id"`);
    const applied = new Set(updated.map((u) => u.id));
    const ledger = reps.filter((r) => applied.has(r.id));
    if (ledger.length > 0) {
      await tx.doctrineReputationLedger.createMany({
        data: ledger.map((r) => ({
          id: randomUUID(),
          reputationId: r.id,
          action: 'WEEKLY_DECAY',
          xpDelta: decayedXp(r.totalXp) - r.totalXp,
          reason: DECAY_REASON,
        })),
      });
    }
    return ledger.length;
  });
}

// ─── registration ───────────────────────────────────────────────────────────

type BossLike = {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
};

export async function registerDoctrineJobs(boss: BossLike): Promise<void> {
  const log: Pick<Console, 'info'> = console;
  // exclusive: at most one run queued or active per queue, however many workers run.
  for (const q of [DOCTRINE_PUZZLES_QUEUE, DOCTRINE_SAHUR_QUEUE, DOCTRINE_DECAY_QUEUE]) {
    await boss.createQueue(q, { policy: 'exclusive' });
  }
  // A failed midnight run retries for a few minutes; the boot run below covers a longer outage.
  await boss.schedule(
    DOCTRINE_PUZZLES_QUEUE,
    DAILY_PUZZLES_CRON,
    {},
    { tz: 'UTC', retryLimit: 5, retryDelay: 60 },
  );
  await boss.schedule(DOCTRINE_SAHUR_QUEUE, SAHUR_CRON, {}, { tz: 'UTC' });
  await boss.schedule(DOCTRINE_DECAY_QUEUE, DECAY_CRON, {}, { tz: 'UTC' });

  await boss.work(DOCTRINE_PUZZLES_QUEUE, async () => {
    const created = await generateDailyPuzzles();
    if (created.length > 0)
      log.info(`[doctrine] created puzzles for tomorrow: ${created.join(',')}`);
  });
  await boss.work(DOCTRINE_SAHUR_QUEUE, async () => {
    await checkSahurActivation();
  });
  await boss.work(DOCTRINE_DECAY_QUEUE, async () => {
    const n = await applyReputationDecay();
    if (n > 0) log.info(`[doctrine] applied reputation decay count=${n}`);
  });
  // The Go worker generated tomorrow's puzzles at startup too (A19's runbook relies on it).
  await boss.send?.(DOCTRINE_PUZZLES_QUEUE, {}).catch(() => undefined);
}
