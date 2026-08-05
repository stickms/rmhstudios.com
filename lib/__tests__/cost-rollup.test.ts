/**
 * E11 — the per-feature cost rollup.
 *
 * Everything interesting about this aggregation is an edge nobody reproduces by
 * hand against real data: a day with spend and nobody online, an anonymous call
 * that costs money but is not a user, a task nobody has mapped to a feature
 * yet, and the difference between "distinct users today" and "distinct users
 * this month". So the fold is a pure function and this is where it is pinned.
 */

import { describe, it, expect, vi } from 'vitest';

// `lib/analytics/cost.server.ts` imports the Prisma singleton, which throws at
// module scope without DATABASE_URL. The rollup itself never touches it.
vi.mock('@/lib/prisma.server', () => ({ prisma: {}, prismaRead: {}, hasReadReplica: false }));

import {
  dayRange,
  featureForTask,
  rollupFeatureCosts,
  utcDay,
  type ActiveDay,
  type UsageRow,
} from '@/lib/analytics/cost.server';

const DAYS = ['2026-08-01', '2026-08-02', '2026-08-03'];

// `Omit` before intersecting: `Partial<UsageRow>` already carries
// `createdAt?: Date`, and intersecting that with `{ createdAt: string }` yields
// `Date & string` — a type no literal can satisfy.
function usage(partial: Omit<Partial<UsageRow>, 'createdAt'> & { createdAt: string }): UsageRow {
  return {
    userId: 'u1',
    task: 'concierge',
    costMicros: 1000,
    ok: true,
    ...partial,
    createdAt: new Date(partial.createdAt),
  };
}

const ACTIVE: ActiveDay[] = [
  { day: '2026-08-01', activeUsers: 100 },
  { day: '2026-08-02', activeUsers: 200 },
  { day: '2026-08-03', activeUsers: 0 },
];

describe('day helpers', () => {
  it('buckets by UTC calendar day', () => {
    expect(utcDay(new Date('2026-08-02T23:59:59.999Z'))).toBe('2026-08-02');
    expect(utcDay(new Date('2026-08-03T00:00:00.000Z'))).toBe('2026-08-03');
  });

  it('enumerates an inclusive range', () => {
    expect(dayRange(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-03T23:59:59Z'))).toEqual(
      DAYS,
    );
  });

  it('crosses a month boundary', () => {
    expect(dayRange(new Date('2026-07-31T12:00:00Z'), new Date('2026-08-01T05:00:00Z'))).toEqual([
      '2026-07-31',
      '2026-08-01',
    ]);
  });
});

describe('featureForTask', () => {
  it('maps a routing task to a product surface', () => {
    expect(featureForTask('compose-assist')).toBe('compose');
    expect(featureForTask('narrative')).toBe('recaps');
  });

  it('passes an unmapped task through as itself', () => {
    // Deliberately NOT an "other" bucket: a new task showing up under its own
    // name is a prompt to map it; folding it into "other" is how a feature's
    // spend quietly disappears.
    expect(featureForTask('brand-new-task')).toBe('brand-new-task');
  });
});

describe('rollupFeatureCosts', () => {
  it('produces cost per active user per feature per day', () => {
    const { rows } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-01T09:00:00Z', costMicros: 3000 }),
        usage({ createdAt: '2026-08-01T10:00:00Z', costMicros: 2000, userId: 'u2' }),
      ],
      ACTIVE,
      DAYS,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      day: '2026-08-01',
      feature: 'concierge',
      aiMicros: 5000,
      calls: 2,
      featureUsers: 2,
      activeUsers: 100,
      microsPerActiveUser: 50,
      microsPerFeatureUser: 2500,
    });
  });

  it('never divides by a day nobody was online', () => {
    const { rows } = rollupFeatureCosts(
      [usage({ createdAt: '2026-08-03T09:00:00Z', costMicros: 9999 })],
      ACTIVE,
      DAYS,
    );
    // Infinity would make the chart unreadable and the number meaningless.
    expect(rows[0].activeUsers).toBe(0);
    expect(rows[0].microsPerActiveUser).toBe(0);
    expect(rows[0].aiMicros).toBe(9999);
  });

  it('counts anonymous spend but not as a user', () => {
    const { rows } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-02T09:00:00Z', userId: null, costMicros: 700 }),
        usage({ createdAt: '2026-08-02T09:05:00Z', userId: null, costMicros: 300 }),
      ],
      ACTIVE,
      DAYS,
    );
    // One signed-out visitor hammering the concierge must not read as one very
    // expensive user.
    expect(rows[0].aiMicros).toBe(1000);
    expect(rows[0].calls).toBe(2);
    expect(rows[0].featureUsers).toBe(0);
    expect(rows[0].microsPerFeatureUser).toBe(0);
  });

  it('separates failures, which are spend with nothing to show for it', () => {
    const { rows } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-01T09:00:00Z', ok: false, costMicros: 400 }),
        usage({ createdAt: '2026-08-01T09:01:00Z', ok: true, costMicros: 600 }),
      ],
      ACTIVE,
      DAYS,
    );
    expect(rows[0].calls).toBe(2);
    expect(rows[0].failures).toBe(1);
    expect(rows[0].aiMicros).toBe(1000);
  });

  it('drops rows outside the requested window', () => {
    const { rows } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-07-31T23:00:00Z', costMicros: 5 }),
        usage({ createdAt: '2026-08-01T01:00:00Z', costMicros: 10 }),
      ],
      ACTIVE,
      DAYS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].aiMicros).toBe(10);
  });

  it('splits by feature and orders stably', () => {
    const { rows } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-02T09:00:00Z', task: 'summarize' }),
        usage({ createdAt: '2026-08-01T09:00:00Z', task: 'moderate' }),
        usage({ createdAt: '2026-08-01T09:00:00Z', task: 'concierge' }),
      ],
      ACTIVE,
      DAYS,
    );
    // Chronological, then alphabetical — so a chart's series don't reshuffle
    // between refreshes.
    expect(rows.map((r) => `${r.day}/${r.feature}`)).toEqual([
      '2026-08-01/concierge',
      '2026-08-01/moderation',
      '2026-08-02/summaries',
    ]);
  });

  it('leaves the unbuilt attribution streams declared and zero', () => {
    const { rows } = rollupFeatureCosts(
      [usage({ createdAt: '2026-08-01T09:00:00Z' })],
      ACTIVE,
      DAYS,
    );
    // E7 (R2 key prefixing) and the feature tag on E1's traces do not exist
    // yet. Showing 0 is honest; omitting the columns loses the requirement.
    expect(rows[0].egressBytes).toBe(0);
    expect(rows[0].dbMillis).toBe(0);
  });
});

describe('window totals', () => {
  it('counts a user once across the window, not once per day', () => {
    const { totals } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-01T09:00:00Z', userId: 'u1' }),
        usage({ createdAt: '2026-08-02T09:00:00Z', userId: 'u1' }),
        usage({ createdAt: '2026-08-02T10:00:00Z', userId: 'u2' }),
      ],
      ACTIVE,
      DAYS,
    );
    expect(totals).toHaveLength(1);
    // Summing the daily distincts would say three.
    expect(totals[0].featureUsers).toBe(2);
    expect(totals[0].calls).toBe(3);
  });

  it('averages cost-per-active-user only over days with traffic', () => {
    const { totals } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-01T09:00:00Z', costMicros: 1000 }), // /100 = 10
        usage({ createdAt: '2026-08-02T09:00:00Z', costMicros: 4000 }), // /200 = 20
        usage({ createdAt: '2026-08-03T09:00:00Z', costMicros: 5000 }), // 0 active
      ],
      ACTIVE,
      DAYS,
    );
    // Averaging in the zero from the day nobody was online would drag every
    // feature's number toward zero and hide the real cost.
    expect(totals[0].microsPerActiveUser).toBe(15);
    expect(totals[0].aiMicros).toBe(10000);
  });

  it('ranks the most expensive feature first', () => {
    const { totals } = rollupFeatureCosts(
      [
        usage({ createdAt: '2026-08-01T09:00:00Z', task: 'moderate', costMicros: 100 }),
        usage({ createdAt: '2026-08-01T09:00:00Z', task: 'narrative', costMicros: 9000 }),
      ],
      ACTIVE,
      DAYS,
    );
    expect(totals.map((t) => t.feature)).toEqual(['recaps', 'moderation']);
  });

  it('is empty when nothing was spent', () => {
    const { rows, totals } = rollupFeatureCosts([], ACTIVE, DAYS);
    expect(rows).toEqual([]);
    expect(totals).toEqual([]);
  });
});
