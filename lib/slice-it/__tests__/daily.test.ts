/**
 * S1 — the daily challenge (`lib/slice-it/daily.server.ts`).
 *
 * Two things here are the mode, and both are the kind of thing that breaks
 * silently:
 *
 *  - **Determinism.** The day's chart is a pure function of the day key. If two
 *    processes disagree, half the players get a different daily and neither
 *    board means anything. The load-bearing part is easy to lose: the pool query
 *    must be stably ordered, because a hash into an unordered array is a random
 *    pick with extra steps.
 *  - **One attempt.** Enforced by `@@unique([dayKey, userId])`, so the test that
 *    matters is that the module treats a P2002 as the answer rather than as a
 *    500 — and that it does not read-then-write, which is the version two tabs
 *    walk past.
 *
 * There is no Postgres in this repository, so `@/lib/prisma.server` is mocked to
 * a small in-memory stand-in modelling exactly the calls this module makes.
 * `DATABASE_URL` is still set because the mock is per-module and anything else
 * in the graph reaching the real client would throw at import.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/unused';

type FakeChart = {
  id: string;
  songId: string;
  difficulty: string;
  song: { title: string; artist: string; coverUrl: string | null; duration: number };
};

type FakeEntry = {
  dayKey: string;
  userId: string;
  songId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
};

const state: {
  charts: FakeChart[];
  entries: FakeEntry[];
  /** Every `where` the chart query was called with, so eligibility is checkable. */
  chartWheres: Record<string, unknown>[];
  chartOrderBys: unknown[];
  reported: unknown[];
} = { charts: [], entries: [], chartWheres: [], chartOrderBys: [], reported: [] };

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    chart: {
      findMany: vi.fn(
        async ({ where, orderBy }: { where: Record<string, unknown>; orderBy: unknown }) => {
          state.chartWheres.push(where);
          state.chartOrderBys.push(orderBy);
          return state.charts;
        },
      ),
    },
    sliceDailyEntry: {
      create: vi.fn(async ({ data }: { data: FakeEntry }) => {
        if (state.entries.some((e) => e.dayKey === data.dayKey && e.userId === data.userId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        state.entries.push(data);
        return data;
      }),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      count: vi.fn(
        async ({ where }: { where: { dayKey: string; score?: { gt: number } } }) =>
          state.entries.filter(
            (e) => e.dayKey === where.dayKey && (where.score ? e.score > where.score.gt : true),
          ).length,
      ),
    },
  },
}));

vi.mock('@/lib/game/results.server', () => ({
  reportGameResult: vi.fn(async (userId: string, payload: unknown) => {
    state.reported.push({ userId, payload });
  }),
}));

const {
  DAILY_MIN_PLAYS,
  DAILY_MODIFIERS,
  dailyHash,
  dailySelection,
  msUntilNextDay,
  submitDailyEntry,
} = await import('@/lib/slice-it/daily.server');

function chart(id: string, songId = `song-${id}`, difficulty = 'normal'): FakeChart {
  return {
    id,
    songId,
    difficulty,
    song: { title: `Track ${id}`, artist: 'Artist', coverUrl: null, duration: 120 },
  };
}

beforeEach(() => {
  state.charts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => chart(id));
  state.entries = [];
  state.chartWheres = [];
  state.chartOrderBys = [];
  state.reported = [];
});

describe('dailyHash', () => {
  it('is stable for the same input', () => {
    expect(dailyHash('slice-daily:2026-08-06')).toBe(dailyHash('slice-daily:2026-08-06'));
  });

  it('separates adjacent days', () => {
    expect(dailyHash('slice-daily:2026-08-06')).not.toBe(dailyHash('slice-daily:2026-08-07'));
  });

  it('stays a non-negative 32-bit integer, so `% pool.length` is a valid index', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31', '1999-02-28']) {
      const h = dailyHash(`slice-daily:${day}`);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('dailySelection', () => {
  it('is identical for every caller on the same day', async () => {
    const a = await dailySelection('2026-08-06');
    const b = await dailySelection('2026-08-06');
    expect(a?.chartId).toBe(b?.chartId);
    expect(a?.songId).toBe(b?.songId);
  });

  it('varies across days', async () => {
    const picks = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      const sel = await dailySelection(`2026-08-${String(d).padStart(2, '0')}`);
      picks.add(sel?.chartId ?? '');
    }
    // Not "all different" — a hash into 7 charts collides — but a selector stuck
    // on one chart is the failure this catches.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('orders the pool stably, which is what makes the hash reproducible', async () => {
    await dailySelection('2026-08-06');
    expect(state.chartOrderBys[0]).toEqual({ id: 'asc' });
  });

  it('only draws from public charts on well-played public songs', async () => {
    await dailySelection('2026-08-06');
    const where = state.chartWheres[0] as {
      status: { in: string[] };
      song: { isPublic: boolean; plays: { gte: number } };
    };
    expect(where.status.in).toEqual(['public', 'ranked']);
    expect(where.song.isPublic).toBe(true);
    expect(where.song.plays.gte).toBe(DAILY_MIN_PLAYS);
  });

  it('returns null rather than inventing a daily when nothing is eligible', async () => {
    state.charts = [];
    expect(await dailySelection('2026-08-06')).toBeNull();
  });

  it('fixes the modifier set, gauge on, at 1.0x', async () => {
    const sel = await dailySelection('2026-08-06');
    expect(sel?.modifiers.healthGauge).toBe(true);
    expect(sel?.modifiers.speed).toBe(1);
    expect(DAILY_MODIFIERS.healthGauge).toBe(true);
    // The daily must not land on the `challenge` board — see pools.ts.
    expect(sel?.modPool).toBe('standard');
  });

  it('reports the chart difficulty as the day’s difficulty', async () => {
    state.charts = [chart('x', 'song-x', 'expert')];
    const sel = await dailySelection('2026-08-06');
    expect(sel?.difficulty).toBe('expert');
    expect(sel?.modifiers.difficulty).toBe('expert');
  });
});

describe('submitDailyEntry', () => {
  const attempt = (score = 1000) => ({
    songId: '',
    score,
    accuracy: 95,
    maxCombo: 200,
    cleared: true,
  });

  async function todaysSong(): Promise<string> {
    const sel = await dailySelection();
    return sel?.songId ?? '';
  }

  it('files the first attempt of the day', async () => {
    const songId = await todaysSong();
    const result = await submitDailyEntry('u1', { ...attempt(5000), songId });
    expect(result.ok).toBe(true);
    expect(state.entries).toHaveLength(1);
  });

  it('refuses a second attempt because the unique index does', async () => {
    const songId = await todaysSong();
    await submitDailyEntry('u1', { ...attempt(5000), songId });
    const second = await submitDailyEntry('u1', { ...attempt(9999), songId });
    expect(second).toEqual({ ok: false, reason: 'already-played' });
    // The refusal came from the write, not from a read before it: the second
    // call still attempted the insert, and the stored score is the first one.
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].score).toBe(5000);
  });

  it('lets a different player play the same day', async () => {
    const songId = await todaysSong();
    await submitDailyEntry('u1', { ...attempt(1), songId });
    const other = await submitDailyEntry('u2', { ...attempt(2), songId });
    expect(other.ok).toBe(true);
    expect(state.entries).toHaveLength(2);
  });

  it('rejects a submission for a song that is not today’s', async () => {
    const result = await submitDailyEntry('u1', { ...attempt(), songId: 'not-todays-song' });
    expect(result).toEqual({ ok: false, reason: 'wrong-song' });
    expect(state.entries).toHaveLength(0);
  });

  it('refuses when there is no daily at all', async () => {
    state.charts = [];
    const result = await submitDailyEntry('u1', { ...attempt(), songId: 'anything' });
    expect(result).toEqual({ ok: false, reason: 'no-daily' });
  });

  it('feeds the Arcade Pass through reportGameResult, flagged as a daily', async () => {
    const songId = await todaysSong();
    await submitDailyEntry('u1', { ...attempt(4200), songId });
    expect(state.reported).toEqual([
      { userId: 'u1', payload: { game: 'slice-it', score: 4200, daily: true } },
    ]);
  });

  it('does not report a refused attempt', async () => {
    const songId = await todaysSong();
    await submitDailyEntry('u1', { ...attempt(1), songId });
    state.reported = [];
    await submitDailyEntry('u1', { ...attempt(2), songId });
    expect(state.reported).toHaveLength(0);
  });

  it('ranks against the rest of the day', async () => {
    const songId = await todaysSong();
    await submitDailyEntry('a', { ...attempt(9000), songId });
    await submitDailyEntry('b', { ...attempt(8000), songId });
    const third = await submitDailyEntry('c', { ...attempt(8500), songId });
    expect(third.ok && third.rank).toBe(2);
  });
});

describe('msUntilNextDay', () => {
  it('counts down to the next UTC midnight', () => {
    const noon = new Date('2026-08-06T12:00:00.000Z');
    expect(msUntilNextDay(noon)).toBe(12 * 3600 * 1000);
  });

  it('is a full day at midnight, never zero or negative', () => {
    const midnight = new Date('2026-08-06T00:00:00.000Z');
    expect(msUntilNextDay(midnight)).toBe(86_400_000);
  });
});
