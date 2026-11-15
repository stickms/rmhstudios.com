import { beforeEach, describe, expect, it, vi } from 'vitest';

/** One in-memory `music_sprint_daily`, enough for the save's createMany / updateMany / findUnique. */
const h = vi.hoisted(() => {
  const rows = new Map<string, { score: number | null; results: unknown }>();
  const key = (w: { userId: string; date: string }) => `${w.userId}|${w.date}`;
  return {
    rows,
    prisma: {
      musicSprintDaily: {
        createMany: vi.fn(async ({ data }: { data: { userId: string; date: string }[] }) => {
          let count = 0;
          for (const d of data) {
            if (!rows.has(key(d))) {
              rows.set(key(d), { score: null, results: null });
              count++;
            }
          }
          return { count };
        }),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { userId: string; date: string };
            data: { score: number; results: unknown };
          }) => {
            const row = rows.get(key(where));
            if (!row || row.score !== null) return { count: 0 };
            row.score = data.score;
            row.results = JSON.parse(JSON.stringify(data.results));
            return { count: 1 };
          },
        ),
        findUnique: vi.fn(async ({ where }: { where: { userId_date: { userId: string; date: string } } }) =>
          rows.get(key(where.userId_date)) ?? null,
        ),
      },
    },
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: h.prisma }));

import { DAILY_LEVELS, DAILY_PROMPTS_PER_LEVEL, sprintLevel } from './levels';
import type { PromptResult } from './scoring';
import { saveSprintDaily, startSprintDaily } from './sprint.server';

const NOW = Date.UTC(2026, 10, 15, 12);
const run = (ms: number): PromptResult[] =>
  DAILY_LEVELS.flatMap((level) =>
    Array.from({ length: DAILY_PROMPTS_PER_LEVEL }, () => {
      const kind = sprintLevel(level)?.kind ?? 'note';
      return {
        level,
        kind,
        correct: true,
        ms,
        noteMs: kind === 'bar' ? [ms / 4, ms / 4, ms / 4, ms / 4] : [ms],
        points: 100,
        skipped: false,
      };
    }),
  );

beforeEach(() => h.rows.clear());

describe('saveSprintDaily — one scored run per user per date', () => {
  it('saves the first run, answers saved to the same run retried, already-scored to another', async () => {
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000), NOW)).resolves.toBe('saved');
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000), NOW)).resolves.toBe('saved');
    await expect(saveSprintDaily('u1', '2026-11-15', run(900), NOW)).resolves.toBe('already-scored');
    // Another learner, or another day, is its own row.
    await expect(saveSprintDaily('u2', '2026-11-15', run(900), NOW)).resolves.toBe('saved');
  });

  it('a started run is the scored one: the start makes the row, the save fills it once', async () => {
    await expect(startSprintDaily('u1', '2026-11-15', NOW)).resolves.toEqual({ scored: true });
    await expect(startSprintDaily('u1', '2026-11-15', NOW)).resolves.toEqual({ scored: false });
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000), NOW)).resolves.toBe('saved');
  });

  it('refuses a date outside the window and an impossible run, writing nothing', async () => {
    await expect(saveSprintDaily('u1', '2026-11-14', run(1000), NOW)).resolves.toBe('invalid');
    await expect(startSprintDaily('u1', '2026-11-16', NOW)).resolves.toBeNull();
    await expect(saveSprintDaily('u1', '2026-11-15', run(1000).slice(1), NOW)).resolves.toBe('invalid');
    expect(h.rows.size).toBe(0);
  });

  it('stores the recomputed score, not the points the client sent', async () => {
    const slow = run(3000).map((r) => ({ ...r, points: 100 }));
    await saveSprintDaily('u1', '2026-11-15', slow, NOW);
    expect(h.rows.get('u1|2026-11-15')?.score).toBeLessThan(100);
  });
});
