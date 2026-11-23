/**
 * Daily request budgets (owner 2026-11-23: never spam a source). One budget per source host, shared by every job that
 * talks to that host (Admit live, interviews and history; SDN live, backfill and interviews on theirs), counted per UTC
 * day in `MedRequestBudget` so a restart or deploy does not reset it. `createPoliteHost` takes one as its `budget` and
 * asks it before every HTTP attempt; when it is spent the session halts and the job ends PARTIAL, and the next UTC day
 * starts a fresh count. A job can also have its own daily quota under a second key (the Admit history lookups).
 *
 * The worker is one process, so the running count is held in memory and written through on every take; the row is read
 * once per day to pick up what an earlier process of the same day already spent. A write that fails refuses the request
 * (closed), never lets it through uncounted.
 */
import type { RequestBudget } from './http';
import type { MedPrisma } from './types';

const dayStart = (d: Date): Date => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);

export interface DailyBudget extends RequestBudget {
  /** Requests spent so far today (UTC). */
  used(): Promise<number>;
  /** Requests left today, never negative. */
  remaining(): Promise<number>;
  /** Spend `n` units of the day's allowance; false (and nothing spent) when fewer than `n` are left. */
  takeMany(n: number): Promise<boolean>;
}

export function createDailyBudget(
  prisma: MedPrisma,
  key: string,
  limit: () => number,
  now: () => Date = () => new Date(),
): DailyBudget {
  let loaded: { day: number; used: number } | null = null;
  // Serializes loads and takes, so concurrent callers cannot read the same count.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  async function current(): Promise<{ day: number; used: number; date: Date }> {
    const date = dayStart(now());
    if (!loaded || loaded.day !== date.getTime()) {
      const row = await prisma.medRequestBudget.findFirst({ where: { key, day: date } });
      loaded = { day: date.getTime(), used: row?.requests ?? 0 };
    }
    return { ...loaded, date };
  }

  return {
    used: () => exclusive(async () => (await current()).used),
    remaining: () => exclusive(async () => Math.max(0, limit() - (await current()).used)),
    take: () => exclusive(() => spend(1)),
    takeMany: (n) => exclusive(() => spend(n)),
  };

  async function spend(n: number): Promise<boolean> {
    try {
      const cur = await current();
      if (cur.used + n > limit()) return false;
      const used = cur.used + n;
      await prisma.medRequestBudget.upsert({
        where: { key_day: { key, day: cur.date } },
        create: { key, day: cur.date, requests: used },
        update: { requests: used },
      });
      loaded = { day: cur.day, used };
      return true;
    } catch {
      return false;
    }
  }
}
