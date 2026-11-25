/**
 * The runtime failures sprint 13's integration found, which green tests had pinned because their fakes accepted any
 * argument. Each is reproduced here as the shape or value that failed, and each is rejected by the checker; the
 * corrected shapes pass. The adopted suites (`rating-contributions.test.ts`, `sell.test.ts`, `feed-ladder.test.ts`)
 * hold the same property through the real modules.
 */
import { describe, expect, it } from 'vitest';
import { assertJsonSafe, assertQueryShape, queryShapeProblems } from '@/lib/db/query-shape';

describe('sprint 13: collectContributions on SliceRun', () => {
  it('rejected `accuracy: { not: null }`, because SliceRun.accuracy is required', () => {
    expect(() =>
      assertQueryShape('SliceRun', 'findMany', {
        where: { userId: 'u', cleared: true, accuracy: { not: null } },
      }),
    ).toThrow(/SliceRun\.findMany[\s\S]*where\.accuracy\.not[\s\S]*SliceRun\.accuracy/);
  });

  it("rejected `nulls: 'last'` ordering, because SliceRun.accuracy is required", () => {
    expect(() =>
      assertQueryShape('SliceRun', 'findMany', {
        orderBy: [{ chart: { rating: 'desc' } }, { accuracy: { sort: 'desc', nulls: 'last' } }],
      }),
    ).toThrow(/orderBy\[1\]\.accuracy[\s\S]*nulls/);
  });

  it('accepts the read the fix shipped', () => {
    expect(
      queryShapeProblems('SliceRun', 'findMany', {
        where: {
          userId: 'u',
          modPool: 'none',
          cleared: true,
          chartId: { not: null },
          chart: { rankStatus: 'ranked', rating: { not: null } },
        },
        orderBy: [{ chart: { rating: 'desc' } }, { accuracy: 'desc' }],
        distinct: ['chartId'],
        take: 40,
        select: { chartId: true, accuracy: true, chart: { select: { rating: true } } },
      }),
    ).toEqual([]);
  });
});

describe('sprint 13: a replayed prediction sale', () => {
  it('returned the ledger BigInt amount in a response body', () => {
    // `CoinTransaction.amount` is a BigInt column; `Response.json` throws on it.
    expect(() => assertJsonSafe({ sharesSold: 0, proceeds: 5n, replayed: true })).toThrow(/proceeds/);
  });

  it('is fine once the amount is a number', () => {
    expect(() => assertJsonSafe({ sharesSold: 0, proceeds: Number(5n), replayed: true })).not.toThrow();
  });
});

describe('sprint 13: the RMHLadder calendar read', () => {
  it('selected job.updatedAt, a column LadderJob does not have, through a nested select', () => {
    const [problem] = queryShapeProblems('LadderApplication', 'findMany', {
      select: { id: true, job: { select: { id: true, updatedAt: true, lastSeenAt: true } } },
    });
    expect(problem).toContain('LadderApplication.findMany');
    expect(problem).toContain('select.job.select.updatedAt');
    expect(problem).toContain('LadderJob has no field "updatedAt"');
  });

  it('accepts the columns the job does have', () => {
    expect(
      queryShapeProblems('LadderApplication', 'findMany', {
        where: { userId: 'u', status: { notIn: ['REJECTED'] } },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          updatedAt: true,
          job: { select: { id: true, lastSeenAt: true, discoveredAt: true, company: { select: { name: true } } } },
        },
      }),
    ).toEqual([]);
  });
});
