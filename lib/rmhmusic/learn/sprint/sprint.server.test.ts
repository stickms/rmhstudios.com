import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  userId: string;
  date: string;
  score: number | null;
  avgMs: number | null;
  results: unknown;
  createdAt: Date;
  ranked: boolean;
  unrankedReason: string | null;
}

/**
 * One in-memory `music_sprint_daily`, enough for the save's createMany / findUnique / updateMany /
 * count, and a `content_report` for the `[Auto]` review.
 */
const h = vi.hoisted(() => {
  const rows = new Map<string, Row>();
  const reports: {
    entityType: string;
    entityId: string;
    targetUserId: string | null;
    details: string | null;
    createdAt: Date;
  }[] = [];
  const key = (w: { userId: string; date: string }) => `${w.userId}|${w.date}`;
  const clock = {
    now: 0,
  };
  /** Learners whose board switch is off (everyone else's is on). */
  const boardOff = new Set<string>();
  return {
    rows,
    boardOff,
    reports,
    clock,
    notify: vi.fn(async () => {}),
    prisma: {
      musicSprintDaily: {
        createMany: vi.fn(
          async ({
            data,
          }: {
            data: {
              userId: string;
              date: string;
            }[];
          }) => {
            let count = 0;
            for (const d of data) {
              if (!rows.has(key(d))) {
                rows.set(key(d), {
                  id: `row-${rows.size + 1}`,
                  userId: d.userId,
                  date: d.date,
                  score: null,
                  avgMs: null,
                  results: null,
                  createdAt: new Date(clock.now),
                  ranked: false,
                  unrankedReason: null,
                });
                count++;
              }
            }
            return {
              count,
            };
          },
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              userId: string;
              date: string;
            };
            data: Partial<Row> & {
              results: unknown;
            };
          }) => {
            const row = rows.get(key(where));
            if (!row || row.score !== null)
              return {
                count: 0,
              };
            Object.assign(row, data, {
              results: JSON.parse(JSON.stringify(data.results)),
            });
            return {
              count: 1,
            };
          },
        ),
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId_date: {
                userId: string;
                date: string;
              };
            };
          }) => rows.get(key(where.userId_date)) ?? null,
        ),
        count: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
              ranked: boolean;
              score: number;
              date: {
                gte: string;
              };
            };
          }) =>
            [...rows.values()].filter(
              (r) =>
                r.userId === where.userId &&
                r.ranked === where.ranked &&
                r.score === where.score &&
                r.date >= where.date.gte,
            ).length,
        ),
      },
      musicSocial: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
            };
          }) => ({
            board: !boardOff.has(where.userId),
            friends: false,
          }),
        ),
      },
      contentReport: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: {
              entityType: string;
              entityId?: string;
              targetUserId?: string;
              createdAt?: {
                gte: Date;
              };
            };
          }) =>
            reports.find(
              (r) =>
                r.entityType === where.entityType &&
                (where.entityId === undefined || r.entityId === where.entityId) &&
                (where.targetUserId === undefined || r.targetUserId === where.targetUserId) &&
                (where.createdAt === undefined || r.createdAt >= where.createdAt.gte),
            ) ?? null,
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: {
              entityType: string;
              entityId: string;
              targetUserId: string;
              details: string;
            };
          }) => {
            reports.push({
              ...data,
              createdAt: new Date(clock.now),
            });
            return data;
          },
        ),
      },
      user: {
        findFirst: vi.fn(async () => ({
          id: 'admin-1',
        })),
      },
    },
  };
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prisma,
}));
vi.mock('@/lib/admin-review.server', () => ({
  notifyAdminsOfReview: h.notify,
}));

import { DAILY_LEVELS, DAILY_PROMPTS_PER_LEVEL, sprintLevel } from './levels';
import type { PromptResult } from './scoring';
import { saveSprintDaily, startSprintDaily } from './sprint.server';

const NOW = Date.UTC(2026, 10, 15, 12);
const MIN = 60_000;
/** The human floors of `plausible.ts`, plus a little: a honest quick reader's fastest answers. */
const FLOOR = {
  note: 270,
  accidental: 320,
  chord: 370,
  bar: 270,
} as const;
/** A run of about `ms` per prompt, varied so it is not too even (bars note by note, human gaps). */
const run = (ms: number): PromptResult[] => {
  let i = 0;
  return DAILY_LEVELS.flatMap((level) =>
    Array.from(
      {
        length: DAILY_PROMPTS_PER_LEVEL,
      },
      (): PromptResult => {
        const kind = sprintLevel(level)?.kind ?? 'note';
        const t = Math.max(FLOOR[kind], Math.round(ms * (0.8 + ((i++ * 37) % 11) / 20)));
        const noteMs =
          kind === 'bar' ? [t, Math.max(90, t / 3), Math.max(90, t / 4), Math.max(90, t / 3)].map(Math.round) : [t];
        return {
          level,
          kind,
          correct: true,
          ms: noteMs.reduce((a, b) => a + b, 0),
          noteMs,
          points: 100,
          skipped: false,
        };
      },
    ),
  );
};
const row = (u: string, d = '2026-11-15') => h.rows.get(`${u}|${d}`);

/** Start at `NOW - minutes`, then save at NOW. */
async function playedFor(u: string, minutes: number, results: PromptResult[], date = '2026-11-15') {
  h.clock.now = NOW - minutes * MIN;
  await startSprintDaily(u, date, NOW - minutes * MIN);
  h.clock.now = NOW;
  return saveSprintDaily(u, date, results, NOW);
}

beforeEach(() => {
  h.rows.clear();
  h.reports.length = 0;
  h.boardOff.clear();
  h.notify.mockClear();
  h.clock.now = NOW;
});

describe('saveSprintDaily — one scored run per user per date', () => {
  it('saves the first run, answers saved to the same run retried, already-scored to another', async () => {
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000), NOW)).resolves.toBe('saved');
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000), NOW)).resolves.toBe('saved');
    await expect(saveSprintDaily('u1', '2026-11-15', run(900), NOW)).resolves.toBe('already-scored');
    // Another learner, or another day, is its own row.
    await expect(saveSprintDaily('u2', '2026-11-15', run(900), NOW)).resolves.toBe('saved');
  });

  it('a started run is the scored one: the start makes the row, the save fills it once', async () => {
    await expect(startSprintDaily('u1', '2026-11-15', NOW)).resolves.toEqual({
      scored: true,
    });
    await expect(startSprintDaily('u1', '2026-11-15', NOW)).resolves.toEqual({
      scored: false,
    });
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000), NOW)).resolves.toBe('saved');
  });

  it('refuses a date outside the window and an impossible run, writing nothing', async () => {
    await expect(saveSprintDaily('u1', '2026-11-14', run(1000), NOW)).resolves.toBe('invalid');
    await expect(startSprintDaily('u1', '2026-11-16', NOW)).resolves.toBeNull();
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000).slice(1), NOW)).resolves.toBe('invalid');
    expect(h.rows.size).toBe(0);
  });

  it('stores the recomputed score, not the points the client sent', async () => {
    const slow = run(3000).map((r) => ({
      ...r,
      points: 100,
    }));
    await saveSprintDaily('u1', '2026-11-15', slow, NOW);
    expect(row('u1')?.score).toBeLessThan(100);
  });
});

describe('saveSprintDaily — the board verdict', () => {
  it('a save after a start that took as long as the run is ranked', async () => {
    await expect(playedFor('u1', 2, run(1500))).resolves.toBe('saved');
    expect(row('u1')).toMatchObject({
      ranked: true,
      unrankedReason: null,
    });
  });

  it('a save that had to create the row itself is kept but not ranked (no-start)', async () => {
    await expect(saveSprintDaily('u1', '2026-11-15', run(1500), NOW)).resolves.toBe('saved');
    expect(row('u1')).toMatchObject({
      ranked: false,
      unrankedReason: 'no-start',
    });
    expect(row('u1')?.score).not.toBeNull();
  });

  it('answers that add up to more than the time since the start fail the clock', async () => {
    // 30 answers of ~1.5 s is ~45 s; the start was 10 s ago.
    h.clock.now = NOW - 10_000;
    await startSprintDaily('u1', '2026-11-15', NOW - 10_000);
    h.clock.now = NOW;
    await saveSprintDaily('u1', '2026-11-15', run(1500), NOW);
    expect(row('u1')).toMatchObject({
      ranked: false,
      unrankedReason: 'clock',
    });
  });

  it('30 answers of 100 ms are kept but not ranked', async () => {
    const fake = run(100).map((r) => ({
      ...r,
      ms: 100,
      noteMs: r.kind === 'bar' ? [25, 25, 25, 25] : [100],
    }));
    await expect(playedFor('u1', 2, fake)).resolves.toBe('saved');
    expect(row('u1')?.ranked).toBe(false);
  });

  it('an identical retry keeps the first verdict', async () => {
    await saveSprintDaily('u1', '2026-11-15', run(1500), NOW);
    expect(row('u1')?.unrankedReason).toBe('no-start');
    await expect(saveSprintDaily('u1', '2026-11-15', run(1500), NOW)).resolves.toBe('saved');
    expect(row('u1')?.unrankedReason).toBe('no-start');
  });
});

describe('saveSprintDaily — the [Auto] review of a perfect, fast run', () => {
  it("files nothing for a private run (the learner's board switch is off)", async () => {
    h.boardOff.add('u1');
    await playedFor('u1', 2, run(320), '2026-11-15');
    expect(row('u1')).toMatchObject({
      ranked: true,
      score: 100,
    });
    expect(h.reports).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('files one [Auto] report for a ranked 100 with a fast mean, and never twice in 30 days', async () => {
    await playedFor('u1', 2, run(320), '2026-11-15');
    expect(row('u1')).toMatchObject({
      ranked: true,
      score: 100,
    });
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]).toMatchObject({
      entityType: 'music-score',
      entityId: row('u1')?.id,
      targetUserId: 'u1',
    });
    expect(h.reports[0]?.details).toMatch(/^\[Auto\]/);
    expect(h.notify).toHaveBeenCalledTimes(1);
    // The next day's perfect run: deduplicated on the learner's recent auto report.
    h.clock.now = Date.UTC(2026, 10, 16, 12) - 2 * MIN;
    await startSprintDaily('u1', '2026-11-16', h.clock.now);
    h.clock.now = Date.UTC(2026, 10, 16, 12);
    await saveSprintDaily('u1', '2026-11-16', run(320), h.clock.now);
    expect(h.reports).toHaveLength(1);
  });

  it('a slower perfect run is not reported until the third in seven days', async () => {
    for (const [d, day] of [
      ['2026-11-13', 13],
      ['2026-11-14', 14],
    ] as const) {
      const at = Date.UTC(2026, 10, day, 12);
      h.clock.now = at - 2 * MIN;
      await startSprintDaily('u1', d, at - 2 * MIN);
      h.clock.now = at;
      await saveSprintDaily('u1', d, run(800), at);
    }
    expect(h.reports).toHaveLength(0);
    await playedFor('u1', 2, run(800));
    expect(row('u1')).toMatchObject({
      ranked: true,
      score: 100,
    });
    expect(h.reports).toHaveLength(1);
  });

  it('a failed report never blocks the save, and an unranked run is never reported', async () => {
    h.prisma.contentReport.create.mockRejectedValueOnce(new Error('db down'));
    await expect(playedFor('u1', 2, run(320))).resolves.toBe('saved');
    await expect(saveSprintDaily('u2', '2026-11-15', run(320), NOW)).resolves.toBe('saved');
    expect(row('u2')?.ranked).toBe(false);
    expect(h.reports).toHaveLength(0);
  });
});
