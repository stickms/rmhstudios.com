/**
 * The R10 ranked-chart pool — `lib/slice-it/ranking.server.ts`.
 *
 * ## Why this mocks Prisma rather than skipping the transitions
 *
 * The interesting part of R10 is not arithmetic, it is a **state machine**:
 * which transitions are automatic, which are reversible, and which are refused.
 * A test of only the pure helpers would leave every one of those unchecked, and
 * they are exactly where the farming hole re-opens — an automatic promotion to
 * `ranked`, or a `ranked` chart that an automatic gate can demote out from under
 * players' ratings, would each be a silent regression that typechecks.
 *
 * There is no Postgres in this repository, so `@/lib/prisma.server` is mocked to
 * a small in-memory stand-in. It models exactly the four calls the module makes.
 * `DATABASE_URL` is still set below because the mock is applied per-module and
 * anything else in the graph reaching the real client would throw at import.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/unused';

/** The chart row the mocked `findUnique` hands back, mutated by `update`. */
type FakeChart = {
  id: string;
  notes: unknown;
  status: string;
  rankStatus: string;
  difficulty: string;
  song: { duration: number };
};

const state: {
  chart: FakeChart | null;
  runs: { userId: string; cleared: boolean }[];
  updates: Record<string, unknown>[];
} = { chart: null, runs: [], updates: [] };

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    chart: {
      findUnique: vi.fn(async () => state.chart),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.updates.push(data);
        if (state.chart && typeof data.rankStatus === 'string') {
          state.chart.rankStatus = data.rankStatus;
        }
        return { id: state.chart?.id };
      }),
      aggregate: vi.fn(async () => ({ _max: { rating: null } })),
    },
    sliceRun: {
      count: vi.fn(async ({ where }: { where: { cleared?: boolean } }) =>
        where.cleared === true ? state.runs.filter((r) => r.cleared).length : state.runs.length,
      ),
      groupBy: vi.fn(async () =>
        [...new Set(state.runs.map((r) => r.userId))].map((userId) => ({ userId })),
      ),
    },
    song: { update: vi.fn(async () => ({ id: 'song' })) },
  },
}));

const {
  QUALIFY_MIN_CLEAR_RATE,
  QUALIFY_MIN_PLAYERS,
  QUALIFY_MIN_PLAYS,
  RANK_STATUSES,
  clearRate,
  demote,
  evaluateQualification,
  isRankStatus,
  isRankedChart,
  promoteToRanked,
  toRankStatus,
} = await import('@/lib/slice-it/ranking.server');

/** A chart that comfortably clears every gate. */
function cleanChart(overrides: Partial<FakeChart> = {}): FakeChart {
  return {
    id: 'chart-1',
    // A sane 4 NPS `normal` chart: dense enough to be a real chart, well under
    // every lint ceiling, no jacks inside the engine's input debounce.
    notes: Array.from({ length: 480 }, (_, i) => ({
      id: `n${i}`,
      time: 5 + i / 4,
      type: 'STANDARD',
      lane: i % 2,
    })),
    status: 'public',
    rankStatus: 'unranked',
    difficulty: 'normal',
    song: { duration: 180 },
    ...overrides,
  };
}

/** `players` distinct accounts, `perPlayer` runs each, `clearedFrac` cleared. */
function runs(players: number, perPlayer: number, clearedFrac: number) {
  const all: { userId: string; cleared: boolean }[] = [];
  for (let p = 0; p < players; p++) {
    for (let r = 0; r < perPlayer; r++) {
      all.push({ userId: `u${p}`, cleared: all.length / (players * perPlayer) < clearedFrac });
    }
  }
  return all;
}

beforeEach(() => {
  state.chart = cleanChart();
  state.runs = runs(QUALIFY_MIN_PLAYERS + 5, 4, 0.6);
  state.updates = [];
});

describe('the rank status vocabulary', () => {
  it('escalates unranked → qualified → ranked', () => {
    expect(RANK_STATUSES).toEqual(['unranked', 'qualified', 'ranked']);
  });

  it('narrows a database column, and defaults rather than throwing', () => {
    expect(isRankStatus('qualified')).toBe(true);
    expect(isRankStatus('loved')).toBe(false);
    expect(isRankStatus(null)).toBe(false);

    // A typo in a VARCHAR column must not mint a fourth state that the R2
    // aggregation then silently excludes from every board.
    expect(toRankStatus('rankedd')).toBe('unranked');
    expect(toRankStatus(undefined)).toBe('unranked');
    expect(toRankStatus('ranked')).toBe('ranked');
  });
});

describe('clearRate', () => {
  it('is null with no runs, not zero', () => {
    // "Nobody has tried" and "50 people tried and nobody finished" are different
    // claims, and a gate that conflates them rejects a new chart for being new.
    state.runs = [];
    return expect(clearRate('chart-1')).resolves.toBeNull();
  });

  it('is cleared over total', async () => {
    state.runs = [
      { userId: 'a', cleared: true },
      { userId: 'b', cleared: true },
      { userId: 'c', cleared: false },
      { userId: 'd', cleared: false },
    ];
    await expect(clearRate('chart-1')).resolves.toBe(0.5);
  });
});

describe('evaluateQualification', () => {
  it('qualifies a clean, played, clearable chart', async () => {
    const report = await evaluateQualification('chart-1');

    expect(report.blockers).toEqual([]);
    expect(report.eligible).toBe(true);
    expect(report.status).toBe('qualified');
    expect(state.updates.at(-1)).toMatchObject({ rankStatus: 'qualified' });
  });

  it('records no actor on an automatic transition', async () => {
    await evaluateQualification('chart-1');
    // The null is the audit trail: it is how a moderator's decision is later
    // distinguishable from the gate's.
    expect(state.updates.at(-1)).toMatchObject({ rankStatusBy: null });
  });

  it('refuses a chart too few people have played', async () => {
    state.runs = runs(3, 40, 0.6); // plenty of plays, three accounts
    const report = await evaluateQualification('chart-1');

    // The farming shape exactly: one person playing their own chart fifty times
    // is one person's opinion of it.
    expect(report.blockers).toContain('too-few-players');
    expect(report.status).toBe('unranked');
  });

  it('refuses a chart with too few plays', async () => {
    state.runs = runs(QUALIFY_MIN_PLAYERS + 2, 1, 1);
    const report = await evaluateQualification('chart-1');

    expect(report.plays).toBeLessThan(QUALIFY_MIN_PLAYS);
    expect(report.blockers).toContain('too-few-plays');
  });

  it('refuses a chart nobody can clear', async () => {
    state.runs = runs(QUALIFY_MIN_PLAYERS + 5, 4, 0);
    const report = await evaluateQualification('chart-1');

    expect(report.clearRate).toBeLessThan(QUALIFY_MIN_CLEAR_RATE);
    expect(report.blockers).toContain('clear-rate-too-low');
  });

  it('does not refuse a chart everybody clears', async () => {
    // There is deliberately no clear-rate ceiling: an easy chart rates low under
    // C3 and therefore contributes almost nothing to a skill rating. A ceiling
    // would delete the beginner library from the pool to solve that twice.
    state.runs = runs(QUALIFY_MIN_PLAYERS + 5, 4, 1);
    const report = await evaluateQualification('chart-1');

    expect(report.clearRate).toBe(1);
    expect(report.eligible).toBe(true);
  });

  it('refuses a draft however well it is playing', async () => {
    state.chart = cleanChart({ status: 'draft' });
    const report = await evaluateQualification('chart-1');

    expect(report.blockers).toContain('not-public');
  });

  it('refuses a chart with blocking lint errors', async () => {
    // A jack faster than the engine's own per-lane input debounce: the second
    // press is swallowed before it can resolve a note, so the note cannot be hit
    // by anyone, ever. That is an `error` in `beatmap/lint.ts`, not a taste call.
    state.chart = cleanChart({
      notes: Array.from({ length: 600 }, (_, i) => ({
        id: `n${i}`,
        time: 5 + i * 0.01,
        type: 'STANDARD',
        lane: 0,
      })),
    });
    const report = await evaluateQualification('chart-1');

    expect(report.lintErrors).toBeGreaterThan(0);
    expect(report.blockers).toContain('lint-errors');
    expect(report.status).toBe('unranked');
  });

  it('reports every blocker, not just the first', async () => {
    state.chart = cleanChart({ status: 'draft' });
    state.runs = [];
    const report = await evaluateQualification('chart-1');

    // A UI that can only say "not public" makes an author fix one thing,
    // resubmit, and be told the next thing.
    expect(report.blockers).toContain('not-public');
    expect(report.blockers).toContain('too-few-players');
    expect(report.blockers).toContain('clear-rate-unknown');
  });

  it('is reversible: a qualified chart that stops passing drops back', async () => {
    state.chart = cleanChart({ rankStatus: 'qualified' });
    state.runs = runs(2, 2, 1);

    const report = await evaluateQualification('chart-1');

    expect(report.status).toBe('unranked');
    expect(state.updates.at(-1)).toMatchObject({ rankStatus: 'unranked' });
  });

  it('writes nothing when the state does not change', async () => {
    state.chart = cleanChart({ rankStatus: 'unranked' });
    state.runs = [];

    await evaluateQualification('chart-1');
    // Called on every score submission; an unconditional UPDATE would be a write
    // per run per chart forever.
    expect(state.updates).toHaveLength(0);
  });

  it('never touches a ranked chart', async () => {
    state.chart = cleanChart({ rankStatus: 'ranked' });
    state.runs = [];

    const report = await evaluateQualification('chart-1');

    // An automatic demotion would delete a number out of every player's skill
    // rating because a statistic dipped. Removal is a human decision.
    expect(report.status).toBe('ranked');
    expect(state.updates).toHaveLength(0);
  });

  it('reports a missing chart instead of throwing', async () => {
    state.chart = null;
    const report = await evaluateQualification('gone');

    expect(report.eligible).toBe(false);
    expect(report.blockers).toEqual(['not-found']);
  });
});

describe('promoteToRanked', () => {
  it('promotes only from qualified', async () => {
    state.chart = cleanChart({ rankStatus: 'qualified' });
    await expect(promoteToRanked('chart-1', 'mod-1')).resolves.toBe(true);
    expect(state.updates.at(-1)).toMatchObject({ rankStatus: 'ranked', rankStatusBy: 'mod-1' });
  });

  it('refuses to promote an unranked chart', async () => {
    // The automatic gate is a prerequisite, not an alternative path: a moderator
    // must not be able to rank a chart nobody has played or that does not lint.
    state.chart = cleanChart({ rankStatus: 'unranked' });
    await expect(promoteToRanked('chart-1', 'mod-1')).resolves.toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('records the moderator', async () => {
    state.chart = cleanChart({ rankStatus: 'qualified' });
    await promoteToRanked('chart-1', 'mod-7');
    expect(state.updates.at(-1)).toMatchObject({ rankStatusBy: 'mod-7' });
  });
});

describe('demote', () => {
  it('takes a ranked chart all the way back to unranked', async () => {
    state.chart = cleanChart({ rankStatus: 'ranked' });
    await expect(demote('chart-1', 'mod-1')).resolves.toBe(true);

    // Not back to `qualified`: a chart a moderator pulled must not re-enter the
    // pool on the next submission. It re-qualifies only if the gate says so.
    expect(state.updates.at(-1)).toMatchObject({ rankStatus: 'unranked', rankStatusBy: 'mod-1' });
  });

  it('is a no-op on an already-unranked chart', async () => {
    state.chart = cleanChart({ rankStatus: 'unranked' });
    await expect(demote('chart-1', 'mod-1')).resolves.toBe(false);
    expect(state.updates).toHaveLength(0);
  });
});

describe('isRankedChart', () => {
  it('is false for the generated fallback, which has no chart id', async () => {
    // Every run today plays `Song.analysisData`, which is not a `Chart` row: no
    // identity, no author, no lint pass. It cannot be ranked and must not be.
    await expect(isRankedChart(null)).resolves.toBe(false);
    await expect(isRankedChart(undefined)).resolves.toBe(false);
  });

  it('is true only for a ranked chart', async () => {
    state.chart = cleanChart({ rankStatus: 'ranked' });
    await expect(isRankedChart('chart-1')).resolves.toBe(true);

    state.chart = cleanChart({ rankStatus: 'qualified' });
    await expect(isRankedChart('chart-1')).resolves.toBe(false);
  });
});
