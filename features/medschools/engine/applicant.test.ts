import { describe, expect, it } from 'vitest';
import { putStatsBody } from '../api/stats-schemas';
import {
  EMPTY_STATS,
  attemptProblem,
  earlierMcatTotals,
  gpaOk,
  hasAnyStats,
  latestMcat,
  withTotal,
  type McatAttempt,
} from './applicant';

const a = (over: Partial<McatAttempt>): McatAttempt => ({
  year: 2026,
  month: 4,
  day: null,
  total: null,
  cpbs: null,
  cars: null,
  bbls: null,
  psbb: null,
  ...over,
});

describe('MCAT attempts', () => {
  it('accepts a total alone, or four sections, and computes the sum', () => {
    expect(attemptProblem(a({ total: 512 }))).toBeNull();
    const four = a({ cpbs: 128, cars: 127, bbls: 129, psbb: 128 });
    expect(attemptProblem(four)).toBeNull();
    expect(withTotal(four).total).toBe(512);
  });

  it('holds every range edge', () => {
    expect(attemptProblem(a({ total: 472 }))).toBeNull();
    expect(attemptProblem(a({ total: 528 }))).toBeNull();
    expect(attemptProblem(a({ total: 471 }))).toBe('total');
    expect(attemptProblem(a({ total: 529 }))).toBe('total');
    expect(attemptProblem(a({ total: 500, cpbs: 117 }))).toBe('section');
    expect(attemptProblem(a({ total: 500, cars: 133 }))).toBe('section');
    expect(attemptProblem(a({ total: 500, bbls: 118, psbb: 132 }))).toBeNull();
  });

  it('a total that is not the sum of four given sections is refused; three sections need a total', () => {
    expect(attemptProblem(a({ total: 513, cpbs: 128, cars: 127, bbls: 129, psbb: 128 }))).toBe('sum');
    expect(attemptProblem(a({ cpbs: 128, cars: 127, bbls: 129 }))).toBe('empty');
    expect(attemptProblem(a({}))).toBe('empty');
  });

  it('checks the date', () => {
    expect(attemptProblem(a({ total: 510, month: 13 }))).toBe('date');
    expect(attemptProblem(a({ total: 510, month: 2, day: 30 }))).toBe('date');
    expect(attemptProblem(a({ total: 510, year: 2028, month: 2, day: 29 }))).toBeNull();
    expect(attemptProblem(a({ total: 510, year: 2009 }))).toBe('date');
  });

  it('the latest attempt with a total is the most recent by date', () => {
    const list = [a({ year: 2026, month: 6, total: 515 }), a({ year: 2025, month: 9, total: 505 }), a({ year: 2027, month: 1 })];
    expect(latestMcat(list)?.total).toBe(515);
    expect(latestMcat([])).toBeNull();
  });

  it('the earlier totals are every other attempt with a total (for the labels’ weighting)', () => {
    const list = [
      a({ year: 2025, month: 9, total: 505 }),
      a({ year: 2026, month: 6, total: 515 }),
      a({ year: 2027, month: 1 }),
      a({ year: 2024, month: 5, total: 498 }),
    ];
    expect(earlierMcatTotals(list)).toEqual([505, 498]);
    expect(earlierMcatTotals([a({ total: 510 })])).toEqual([]);
    expect(earlierMcatTotals([])).toEqual([]);
    // Two attempts on one date: the later in the list is the latest, the other is earlier.
    expect(earlierMcatTotals([a({ total: 500 }), a({ total: 510 })])).toEqual([500]);
  });
});

describe('GPA', () => {
  it('is 0.00 to 4.00 with two decimals', () => {
    expect(gpaOk(3.81)).toBe(true);
    expect(gpaOk(4)).toBe(true);
    expect(gpaOk(0)).toBe(true);
    expect(gpaOk(4.01)).toBe(false);
    expect(gpaOk(-0.1)).toBe(false);
    expect(gpaOk(3.815)).toBe(false);
    expect(gpaOk(Number.NaN)).toBe(false);
  });
});

describe('putStatsBody', () => {
  it('accepts an empty body and a full one', () => {
    expect(putStatsBody.safeParse({}).success).toBe(true);
    const full = putStatsBody.safeParse({
      mcat: [{ year: 2026, month: 4, day: 12, cpbs: 128, cars: 127, bbls: 129, psbb: 128 }],
      gpa: { cumulative: 3.81, science: 3.7, postbacc: 3.95, postbaccType: 'FORMAL', graduate: 3.9, graduateType: 'SMP' },
      hours: [
        {
          category: 'CLINICAL',
          hours: 900,
          note: ' ER scribe ',
          activities: [{ title: 'Scribe', hours: 800, note: null }],
        },
      ],
      homeState: 'tx',
      missions: ['research', 'research', 'rural'],
      publications: 2,
      presentations: 0,
    });
    expect(full.success).toBe(true);
    if (!full.success) return;
    expect(full.data.mcat?.[0]?.total).toBe(512);
    expect(full.data.hours?.[0]?.note).toBe('ER scribe');
    expect(full.data.missions).toEqual(['research', 'rural']);
  });

  it('refuses unknown keys, out-of-range values, duplicates and control characters', () => {
    for (const bad of [
      { userId: 'x' },
      { gpa: { cumulative: 4.2 } },
      { gpa: { cumulative: 3.811 } },
      { mcat: [{ year: 2026, month: 4, total: 530 }] },
      { mcat: [{ year: 2026, month: 4, total: 500, cpbs: 125, cars: 125, bbls: 125, psbb: 126 }] },
      { mcat: [{ year: 2026, month: 4 }] },
      { mcat: Array.from({ length: 9 }, () => ({ year: 2026, month: 4, total: 500 })) },
      { hours: [{ category: 'CLINICAL' }, { category: 'CLINICAL' }] },
      { hours: [{ category: 'GOLF', hours: 3 }] },
      { hours: [{ category: 'CLINICAL', hours: -1 }] },
      { hours: [{ category: 'CLINICAL', note: 'a\u0000b' }] },
      { hours: [{ category: 'CLINICAL', note: 'x'.repeat(301) }] },
      { homeState: 'ZZ' },
      { missions: ['golf'] },
      { publications: 501 },
      { mcat: [{ year: 2026, month: 4, total: 500, extra: 1 }] },
    ]) {
      expect(putStatsBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
  });

  it('an all-empty stats reads as none', () => {
    expect(hasAnyStats(EMPTY_STATS)).toBe(false);
    expect(hasAnyStats({ ...EMPTY_STATS, publications: 0 })).toBe(true);
  });
});
