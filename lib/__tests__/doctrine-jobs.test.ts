import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { mulberry32 } from '../core/rng';
import { getSeedForDate } from '@features/doctrine/engine/puzzle-engine';
import {
  DAILY_PUZZLES_CRON,
  DECAY_CRON,
  DOCTRINE_DECAY_QUEUE,
  DOCTRINE_PUZZLES_QUEUE,
  DOCTRINE_SAHUR_QUEUE,
  SAHUR_CRON,
  checkSahurActivation,
  decayedXp,
  generateDailyPuzzles,
  registerDoctrineJobs,
  resetTimezoneCache,
  sahurDifficulty,
  tomorrowKey,
} from '@features/doctrine/engine/jobs.server';

// Reference values from the Go worker's parity tests (themselves produced by the
// original Node implementation). They pin the seeds the live puzzles use.
describe('seeds and rng (Go parity values)', () => {
  it('getSeedForDate', () => {
    const date = '2026-06-19';
    expect(getSeedForDate(date, 'alibi')).toBe(489762987);
    expect(getSeedForDate(date, 'spectrum')).toBe(1864840003);
    expect(getSeedForDate(date, 'outcast')).toBe(1313135021);
    expect(getSeedForDate(date, 'chainlink')).toBe(49484481);
    expect(getSeedForDate(date, 'impostor')).toBe(1589193561);
    expect(getSeedForDate(date, 'sahur_special')).toBe(1827053367);
  });
  it('mulberry32', () => {
    const cases: [number, number[]][] = [
      [0, [0.26642920868471265, 0.00032974570058286, 0.22327202744781971]],
      [12345, [0.97972826776094735, 0.30675226449966431, 0.484205421525985]],
      [2147483647, [0.4290980885270983, 0.12713524978607893, 0.38527749828062952]],
    ];
    for (const [seed, want] of cases) {
      const r = mulberry32(seed);
      for (const w of want) expect(r()).toBeCloseTo(w, 14);
    }
  });
});

describe('pure helpers', () => {
  it('tomorrowKey rolls over months and years in UTC', () => {
    expect(tomorrowKey(new Date('2026-11-09T23:59:59Z'))).toBe('2026-11-10');
    expect(tomorrowKey(new Date('2026-12-31T00:00:00Z'))).toBe('2027-01-01');
    expect(tomorrowKey(new Date('2028-02-28T12:00:00Z'))).toBe('2028-02-29');
  });
  it('sahurDifficulty is min(5, base + 1)', () => {
    expect([1, 2, 3, 4, 5].map(sahurDifficulty)).toEqual([2, 3, 4, 5, 5]);
  });
  it('decayedXp is a 5% floor', () => {
    expect([100, 99, 19, 1, 0].map(decayedXp)).toEqual([95, 94, 18, 0, 0]);
  });
  it('schedules: midnight UTC (A19 waits to 00:15), every minute, hourly on Mondays', () => {
    expect(DAILY_PUZZLES_CRON).toBe('0 0 * * *');
    expect(SAHUR_CRON).toBe('* * * * *');
    expect(DECAY_CRON.split(' ').slice(2)).toEqual(['*', '*', '1']);
    expect(DOCTRINE_SAHUR_QUEUE).toBe('doctrine.sahur-activation'); // read by go-services status
  });
});

function puzzleDb(existing: string[] = [], failCreateWith?: { code: string }) {
  const rows: Record<string, unknown>[] = [];
  const db = {
    doctrinePuzzle: {
      findUnique: vi.fn(async ({ where }: { where: { mode_date: { mode: string } } }) =>
        existing.includes(where.mode_date.mode) ? { id: 'x' } : null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (failCreateWith) throw Object.assign(new Error('unique'), failCreateWith);
        rows.push(data);
      }),
    },
  };
  return { db, rows };
}

describe('generateDailyPuzzles', () => {
  const now = new Date('2026-06-18T00:00:05Z'); // tomorrow = 2026-06-19 (a Friday)

  it('creates all six modes for tomorrow with the parity seeds', async () => {
    const { db, rows } = puzzleDb();
    const created = await generateDailyPuzzles(now, db);
    expect(created).toEqual([
      'ALIBI',
      'SPECTRUM',
      'OUTCAST',
      'CHAINLINK',
      'IMPOSTOR',
      'SAHUR_SPECIAL',
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.mode as string, r]));
    expect(by.ALIBI.seed).toBe(489762987);
    expect(by.SAHUR_SPECIAL.seed).toBe(1827053367);
    for (const r of rows) {
      expect((r.date as Date).toISOString()).toBe('2026-06-19T00:00:00.000Z');
      expect((r.resetsAt as Date).toISOString()).toBe('2026-06-20T00:00:00.000Z');
    }
    // Friday = 4; Sahur is one harder.
    expect(by.ALIBI.difficulty).toBe(4);
    expect(by.SAHUR_SPECIAL.difficulty).toBe(5);
    expect(by.SAHUR_SPECIAL.isSahur).toBe(true);
    expect(by.ALIBI.isSahur).toBe(false);
    // Real content for the regular modes, the stub only for the special.
    expect(by.ALIBI.data).toHaveProperty('suspects');
    expect(by.SAHUR_SPECIAL.data).toEqual({ generated: true, seed: 1827053367 });
  });

  it('is idempotent: only missing modes are created', async () => {
    const { db, rows } = puzzleDb([
      'ALIBI',
      'SPECTRUM',
      'OUTCAST',
      'CHAINLINK',
      'IMPOSTOR',
      'SAHUR_SPECIAL',
    ]);
    expect(await generateDailyPuzzles(now, db)).toEqual([]);
    expect(rows).toHaveLength(0);
    const partial = puzzleDb(['ALIBI', 'OUTCAST']);
    expect((await generateDailyPuzzles(now, partial.db)).sort()).toEqual(
      ['CHAINLINK', 'IMPOSTOR', 'SAHUR_SPECIAL', 'SPECTRUM'].sort(),
    );
  });

  it('treats a unique violation (another runner won) as fine but surfaces other errors', async () => {
    expect(await generateDailyPuzzles(now, puzzleDb([], { code: 'P2002' }).db)).toEqual([]);
    await expect(generateDailyPuzzles(now, puzzleDb([], { code: 'P1001' }).db)).rejects.toThrow(
      'unique',
    );
  });
});

describe('checkSahurActivation', () => {
  function deps(timezones: string[], existing: string[] = []) {
    const created: [string, string][] = [];
    return {
      created,
      d: {
        timezones: async () => timezones,
        sessionExists: async (_d: string, tz: string) => existing.includes(tz),
        createSession: async (dk: string, tz: string) => void created.push([dk, tz]),
        log: { info: vi.fn() },
      },
    };
  }
  // 07:30 UTC = 03:30 in New York (EDT, UTC-4) and 08:30 in London.
  const now = new Date('2026-06-19T07:30:00Z');

  it('opens a session (keyed by the UTC date) only for timezones at 03:xx', async () => {
    const { created, d } = deps(['America/New_York', 'Europe/London', 'Nope/Zone', '']);
    expect(await checkSahurActivation(now, d)).toEqual(['America/New_York']);
    expect(created).toEqual([['2026-06-19', 'America/New_York']]);
  });
  it('does not duplicate an existing session', async () => {
    const { created, d } = deps(['America/New_York'], ['America/New_York']);
    expect(await checkSahurActivation(now, d)).toEqual([]);
    expect(created).toEqual([]);
  });
  it('caches the timezone list for 10 minutes', async () => {
    resetTimezoneCache();
    const prisma = (await import('@/lib/prisma.server')).prisma as unknown as {
      $queryRaw?: unknown;
    };
    const q = vi.fn(async () => [{ doctrineTimezone: 'America/New_York' }]);
    prisma.$queryRaw = q;
    const sink = { sessionExists: async () => true, createSession: async () => undefined };
    await checkSahurActivation(now, sink);
    await checkSahurActivation(new Date(now.getTime() + 5 * 60_000), sink);
    expect(q).toHaveBeenCalledTimes(1);
    await checkSahurActivation(new Date(now.getTime() + 11 * 60_000), sink);
    expect(q).toHaveBeenCalledTimes(2);
    resetTimezoneCache();
  });
});

describe('registerDoctrineJobs', () => {
  it('registers three exclusive UTC crons, three workers and one boot run', async () => {
    const boss = {
      createQueue: vi.fn(async () => undefined),
      schedule: vi.fn(async () => undefined),
      work: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
    };
    await registerDoctrineJobs(boss);
    for (const q of [DOCTRINE_PUZZLES_QUEUE, DOCTRINE_SAHUR_QUEUE, DOCTRINE_DECAY_QUEUE]) {
      expect(boss.createQueue).toHaveBeenCalledWith(q, { policy: 'exclusive' });
      expect(boss.work).toHaveBeenCalledWith(q, expect.any(Function));
    }
    expect(boss.schedule).toHaveBeenCalledWith(
      DOCTRINE_PUZZLES_QUEUE,
      '0 0 * * *',
      {},
      expect.objectContaining({ tz: 'UTC' }),
    );
    expect(boss.schedule).toHaveBeenCalledWith(
      DOCTRINE_SAHUR_QUEUE,
      '* * * * *',
      {},
      { tz: 'UTC' },
    );
    expect(boss.schedule).toHaveBeenCalledWith(DOCTRINE_DECAY_QUEUE, DECAY_CRON, {}, { tz: 'UTC' });
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith(DOCTRINE_PUZZLES_QUEUE, {});
  });
});
