import { beforeEach, describe, expect, it, vi } from 'vitest';

// A review writes its history row in the same transaction as the SM-2 state, and the stats
// queries only ever read the session user's rows. A tiny in-memory db with real rollback.

interface Db {
  reviews: Record<string, unknown>[];
  logs: Record<string, unknown>[];
}
const db = vi.hoisted(() => ({ reviews: [], logs: [] }) as Db);
const failLog = vi.hoisted(() => ({ on: false }));
const exportRows = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: unknown) => [
    { id: 5n, cardId: 'c', deckId: 'd', grade: 1, intervalDays: 1, easeFactor: 2.5, reviewedAt: new Date(0) },
  ]),
}));
const queries = vi.hoisted(() => ({ values: [] as unknown[][] }));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    flashcardReview: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        db.reviews.push(create);
      }),
    },
    flashcardReviewLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (failLog.on) throw new Error('log write failed');
        db.logs.push(data);
      }),
      findFirst: vi.fn(async () => null),
      findMany: exportRows.findMany,
    },
  };
  const rawQuery = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.values.push(values);
    return [];
  });
  return {
    prisma: {
      ...tx,
      $queryRaw: rawQuery,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => {
        const snapshot = { reviews: [...db.reviews], logs: [...db.logs] };
        try {
          await fn(tx);
        } catch (err) {
          db.reviews = snapshot.reviews;
          db.logs = snapshot.logs;
          throw err;
        }
      }),
    },
  };
});

const { saveReview } = await import('@/lib/study/review-log.server');
const { getStudyStats, exportStudyStatsData } = await import('@/lib/study/stats.server');

const next = {
  easeFactor: 2.36,
  intervalDays: 6,
  repetitions: 2,
  dueAt: new Date('2026-11-27T00:00:00Z'),
};

beforeEach(() => {
  db.reviews = [];
  db.logs = [];
  failLog.on = false;
  queries.values = [];
});

describe('saveReview', () => {
  it('writes exactly one log row alongside the state update', async () => {
    await saveReview({ userId: 'u1', cardId: 'c1', deckId: 'd1', grade: 2, next });
    expect(db.reviews).toHaveLength(1);
    expect(db.logs).toEqual([
      { userId: 'u1', cardId: 'c1', deckId: 'd1', grade: 2, intervalDays: 6, easeFactor: 2.36 },
    ]);
  });

  it('rolls the state back when the log write fails', async () => {
    failLog.on = true;
    await expect(saveReview({ userId: 'u1', cardId: 'c1', deckId: 'd1', grade: 2, next })).rejects.toThrow(
      'log write failed',
    );
    expect(db.reviews).toHaveLength(0);
    expect(db.logs).toHaveLength(0);
  });
});

describe('getStudyStats', () => {
  it('binds the session user and the time zone in every query', async () => {
    await getStudyStats('user-A', { timeZone: 'Asia/Tokyo' });
    expect(queries.values.length).toBeGreaterThanOrEqual(5);
    for (const values of queries.values) expect(values).toContain('user-A');
    const daily = queries.values[0] ?? [];
    expect(daily).toContain('Asia/Tokyo');
  });

  it('filters by deck through a bound value, never SQL text', async () => {
    await getStudyStats('user-A', { timeZone: 'UTC', deckId: 'deck-1' });
    const flattened = queries.values.flat().map((v) => (typeof v === 'object' && v ? JSON.stringify(v) : v));
    expect(flattened.some((v) => typeof v === 'string' && v.includes('deck-1'))).toBe(true);
  });

  it('reports an empty history without inventing days', async () => {
    const stats = await getStudyStats('user-A', { timeZone: 'UTC' });
    expect(stats.since).toBeNull();
    expect(stats.days).toEqual([]);
    expect(stats.forecast).toHaveLength(30);
    expect(stats.retention.young.rate).toBeNull();
  });
});

describe('exportStudyStatsData', () => {
  it('reads only the given member', async () => {
    const out = await exportStudyStatsData('user-B');
    expect(exportRows.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-B' } }));
    expect(out.reviewLog[0]?.id).toBe(5);
  });
});
