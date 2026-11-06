/**
 * The moderator's half of R10 — what `/admin/slice-it` reads and what it may do.
 *
 * Two properties are load-bearing and neither is visible in a typecheck:
 *
 * 1. **A chart that does not lint cannot be promoted.** The automatic gate is a
 *    prerequisite for the human decision, not an alternative to it. If a lint
 *    error could reach `ranked`, an unhittable note would grow a leaderboard
 *    nobody can full-combo and every scorer's skill rating would be built on it.
 * 2. **Reading the list changes nothing.** `inspectCharts` is what the admin
 *    page calls; a `GET` that silently demoted every `qualified` chart whose
 *    statistics had dipped would be a page nobody could safely refresh.
 *
 * Same in-memory Prisma stand-in as `ranking.test.ts`, extended with the two
 * batched calls (`chart.findMany`, the two-key `sliceRun.groupBy`) that the
 * page-sized read uses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/unused';

type FakeChart = {
  id: string;
  notes: unknown;
  status: string;
  rankStatus: string;
  difficulty: string;
  song: { duration: number };
};

type FakeRun = { chartId: string; userId: string; cleared: boolean };

const state: {
  charts: FakeChart[];
  runs: FakeRun[];
  updates: { id: string; data: Record<string, unknown> }[];
} = { charts: [], runs: [], updates: [] };

function inIds(where: unknown): string[] | null {
  const chartId = (where as { chartId?: { in?: string[] } } | undefined)?.chartId;
  return Array.isArray(chartId?.in) ? chartId.in : null;
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    chart: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return state.charts.find((chart) => chart.id === where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        state.charts.filter((chart) => where.id.in.includes(chart.id)),
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          state.updates.push({ id: where.id, data });
          const chart = state.charts.find((row) => row.id === where.id);
          if (chart && typeof data.rankStatus === 'string') chart.rankStatus = data.rankStatus;
          return { id: where.id };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; rankStatus?: string };
          data: Record<string, unknown>;
        }) => {
          const chart = state.charts.find((row) => row.id === where.id);
          if (!chart || (where.rankStatus !== undefined && chart.rankStatus !== where.rankStatus)) {
            return { count: 0 };
          }
          state.updates.push({ id: where.id, data });
          if (typeof data.rankStatus === 'string') chart.rankStatus = data.rankStatus;
          return { count: 1 };
        },
      ),
      aggregate: vi.fn(async () => ({ _max: { rating: null } })),
    },
    sliceRun: {
      count: vi.fn(async ({ where }: { where: { chartId?: string; cleared?: boolean } }) => {
        const runs = state.runs.filter((run) => run.chartId === where.chartId);
        return where.cleared === true ? runs.filter((run) => run.cleared).length : runs.length;
      }),
      groupBy: vi.fn(
        async ({
          by,
          where,
        }: {
          by: string[];
          where: { chartId?: string | { in: string[] }; cleared?: boolean };
        }) => {
          const ids = inIds(where);
          let runs = state.runs;
          if (ids) runs = runs.filter((run) => ids.includes(run.chartId));
          else if (typeof where.chartId === 'string') {
            runs = runs.filter((run) => run.chartId === where.chartId);
          }
          if (where.cleared === true) runs = runs.filter((run) => run.cleared);

          if (by.length === 1 && by[0] === 'userId') {
            return [...new Set(runs.map((run) => run.userId))].map((userId) => ({ userId }));
          }
          if (by.length === 1 && by[0] === 'chartId') {
            const counts = new Map<string, number>();
            for (const run of runs) counts.set(run.chartId, (counts.get(run.chartId) ?? 0) + 1);
            return [...counts].map(([chartId, n]) => ({ chartId, _count: { _all: n } }));
          }
          const seen = new Map<string, Set<string>>();
          for (const run of runs) {
            const users = seen.get(run.chartId) ?? new Set<string>();
            users.add(run.userId);
            seen.set(run.chartId, users);
          }
          return [...seen].flatMap(([chartId, users]) =>
            [...users].map((userId) => ({ chartId, userId })),
          );
        },
      ),
    },
    song: { update: vi.fn(async () => ({ id: 'song' })) },
  },
}));

const { demote, evaluateQualification, inspectCharts, promoteToRanked } =
  await import('@/lib/slice-it/ranking.server');

/** A chart that clears every gate: public, 4 NPS, no jacks inside the debounce. */
function cleanChart(overrides: Partial<FakeChart> = {}): FakeChart {
  return {
    id: 'chart-clean',
    notes: Array.from({ length: 480 }, (_, i) => ({
      id: `n${i}`,
      time: 5 + i / 4,
      type: 'STANDARD',
      lane: i % 2,
    })),
    status: 'public',
    rankStatus: 'unranked',
    difficulty: 'normal',
    song: { duration: 130 },
    ...overrides,
  };
}

/**
 * The same chart with an unhittable jack in it: two notes in one lane 10 ms
 * apart, well inside the engine's 50 ms input debounce, so the second press is
 * swallowed. That is `lintNotes`' `unhittable-jack`, an **error**.
 */
function brokenChart(overrides: Partial<FakeChart> = {}): FakeChart {
  const notes = [
    ...(cleanChart().notes as { id: string; time: number; type: string; lane: number }[]),
    { id: 'jack-a', time: 40.0, type: 'STANDARD', lane: 0 },
    { id: 'jack-b', time: 40.01, type: 'STANDARD', lane: 0 },
  ];
  return cleanChart({ id: 'chart-broken', notes, ...overrides });
}

/** Enough runs, by enough people, clearing often enough, to pass every count. */
function healthyRuns(chartId: string): FakeRun[] {
  return Array.from({ length: 60 }, (_, i) => ({
    chartId,
    userId: `player-${i % 25}`,
    cleared: i % 2 === 0,
  }));
}

beforeEach(() => {
  state.charts = [];
  state.runs = [];
  state.updates = [];
});

describe('a chart with lint errors cannot be promoted', () => {
  it('never qualifies, however many people play it', async () => {
    const chart = brokenChart();
    state.charts = [chart];
    state.runs = healthyRuns(chart.id);

    const report = await evaluateQualification(chart.id);

    expect(report.lintErrors).toBeGreaterThan(0);
    expect(report.blockers).toContain('lint-errors');
    expect(report.eligible).toBe(false);
    expect(report.status).toBe('unranked');
    // Every other gate passed — the lint error is doing all the work here.
    expect(report.blockers).toEqual(['lint-errors']);
  });

  it('is refused by the moderator action itself', async () => {
    const chart = brokenChart();
    state.charts = [chart];
    state.runs = healthyRuns(chart.id);
    await evaluateQualification(chart.id);
    state.updates = [];

    expect(await promoteToRanked(chart.id, 'moderator-1')).toBe(false);
    expect(chart.rankStatus).toBe('unranked');
    expect(state.updates).toEqual([]);
  });

  it('is refused even if it is somehow already flagged qualified', async () => {
    // The belt to the gate's braces: `promoteToRanked` reads the stored state,
    // so a chart that qualified and was then edited into an error would still
    // be promotable if the refusal lived only in the automatic evaluation. It
    // does not — but the re-evaluation is what has to catch this case, and this
    // pins the order the admin route relies on.
    const chart = brokenChart({ rankStatus: 'qualified' });
    state.charts = [chart];
    state.runs = healthyRuns(chart.id);

    const report = await evaluateQualification(chart.id);
    expect(report.status).toBe('unranked');
    expect(await promoteToRanked(chart.id, 'moderator-1')).toBe(false);
  });

  it('lets a clean chart through the same path', async () => {
    const chart = cleanChart();
    state.charts = [chart];
    state.runs = healthyRuns(chart.id);

    const report = await evaluateQualification(chart.id);
    expect(report.blockers).toEqual([]);
    expect(report.status).toBe('qualified');

    expect(await promoteToRanked(chart.id, 'moderator-1')).toBe(true);
    expect(chart.rankStatus).toBe('ranked');

    expect(await demote(chart.id, 'moderator-1')).toBe(true);
    expect(chart.rankStatus).toBe('unranked');
  });
});

describe('the admin read is evidence, not a transition', () => {
  it('writes nothing, even for a chart that no longer qualifies', async () => {
    const chart = cleanChart({ rankStatus: 'qualified' });
    state.charts = [chart];
    // No runs at all — the automatic gate would demote this to `unranked`.
    state.runs = [];

    const [report] = await inspectCharts([chart.id]);

    expect(state.updates).toEqual([]);
    expect(chart.rankStatus).toBe('qualified');
    expect(report.status).toBe('qualified');
    expect(report.eligible).toBe(false);
    expect(report.blockers).toContain('too-few-players');
    expect(report.clearRate).toBeNull();
  });

  it('reports on a ranked chart, which the automatic gate refuses to score', async () => {
    const chart = cleanChart({ rankStatus: 'ranked' });
    state.charts = [chart];
    state.runs = healthyRuns(chart.id);

    // The evaluating path declines: a ranked chart is out of its scope.
    const evaluated = await evaluateQualification(chart.id);
    expect(evaluated.blockers).toEqual(['wrong-state']);
    expect(evaluated.plays).toBe(0);

    // The inspecting path is what a human demoting it needs to see.
    const [report] = await inspectCharts([chart.id]);
    expect(report.plays).toBe(60);
    expect(report.players).toBe(25);
    expect(report.clearRate).toBeCloseTo(0.5, 5);
    expect(report.status).toBe('ranked');
  });

  it('scores a page of charts independently and in the order asked for', async () => {
    const clean = cleanChart({ id: 'a', rankStatus: 'qualified' });
    const broken = brokenChart({ id: 'b', rankStatus: 'unranked' });
    state.charts = [clean, broken];
    state.runs = [...healthyRuns('a'), ...healthyRuns('b').slice(0, 3)];

    const reports = await inspectCharts(['a', 'b', 'missing']);

    expect(reports.map((r) => r.chartId)).toEqual(['a', 'b', 'missing']);
    expect(reports[0].eligible).toBe(true);
    expect(reports[0].plays).toBe(60);
    expect(reports[1].blockers).toEqual(
      expect.arrayContaining(['lint-errors', 'too-few-players', 'too-few-plays']),
    );
    expect(reports[1].plays).toBe(3);
    // A missing row is reported, not thrown and not silently dropped: an admin
    // list whose length changes between the query and the evidence is a list
    // whose rows do not line up with their numbers.
    expect(reports[2].blockers).toEqual(['not-found']);
  });

  it('is one grouped query per statistic, not one per chart', async () => {
    state.charts = [
      cleanChart({ id: 'a' }),
      cleanChart({ id: 'b' }),
      cleanChart({ id: 'c' }),
      cleanChart({ id: 'd' }),
    ];
    state.runs = [...healthyRuns('a'), ...healthyRuns('b')];

    const { prisma } = await import('@/lib/prisma.server');
    const groupBy = prisma.sliceRun.groupBy as unknown as { mock: { calls: unknown[] } };
    const before = groupBy.mock.calls.length;

    await inspectCharts(['a', 'b', 'c', 'd']);

    // Three grouped reads for four charts, and it stays three for four hundred.
    expect(groupBy.mock.calls.length - before).toBe(3);
  });

  it('answers an empty page without touching the database', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    const findMany = prisma.chart.findMany as unknown as { mock: { calls: unknown[] } };
    const before = findMany.mock.calls.length;
    expect(await inspectCharts([])).toEqual([]);
    expect(findMany.mock.calls.length).toBe(before);
  });
});
