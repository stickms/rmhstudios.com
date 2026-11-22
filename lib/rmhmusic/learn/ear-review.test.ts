import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import type { CardRow } from './content/practice';
import { buildEarSession, earItemOf, earReviews, msSinceHeard } from './ear-review';
import { dealQuestions, type EarName, type Question } from './machines/ear';
import { DAY_MS } from './srs/schedule';

const NOW = Date.UTC(2026, 10, 22, 12);
const POOL: EarName[] = ['second', 'third', 'fourth', 'fifth'];

function row(name: string, over: Partial<CardRow> = {}): CardRow {
  return {
    cardId: `ear:interval:${name}`,
    due: new Date(NOW - DAY_MS).toISOString(),
    lastReviewAt: new Date(NOW - 5 * DAY_MS).toISOString(),
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    ...over,
  };
}
const names = (qs: Question[]) => qs.map((q) => q.answer);
const counts = (qs: Question[]) => {
  const c: Record<string, number> = {};
  for (const n of names(qs)) c[n] = (c[n] ?? 0) + 1;
  return c;
};

describe('buildEarSession', () => {
  it('is exactly dealQuestions with no stored history for the pool', () => {
    const a = buildEarSession('interval', POOL, [], NOW, 10, mulberry32(7));
    const b = dealQuestions('interval', POOL, 10, mulberry32(7));
    expect(a).toEqual(b);
    const other = [row('sixth')]; // an item outside this pool
    expect(buildEarSession('interval', POOL, other, NOW, 10, mulberry32(7))).toEqual(b);
  });

  it('keeps every name about equally often and never leaves the pool', () => {
    const rows = [row('third'), row('fifth', { due: new Date(NOW + 9 * DAY_MS).toISOString() })];
    for (let seed = 1; seed < 40; seed++) {
      const qs = buildEarSession('interval', POOL, rows, NOW, 10, mulberry32(seed));
      expect(qs).toHaveLength(10);
      const c = counts(qs);
      expect(Object.keys(c).every((n) => (POOL as string[]).includes(n))).toBe(true);
      const v = POOL.map((n) => c[n] ?? 0);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
    }
  });

  it('gives the extra questions to the most overdue name, then unseen ones, then the strongest last', () => {
    const rows = [
      row('second', { due: new Date(NOW - 10 * DAY_MS).toISOString() }), // most overdue
      row('third', { due: new Date(NOW - 1 * DAY_MS).toISOString() }),
      row('fifth', { due: new Date(NOW + 30 * DAY_MS).toISOString(), stability: 200, lastReviewAt: new Date(NOW - DAY_MS).toISOString() }),
    ]; // fourth is unseen
    for (let seed = 1; seed < 20; seed++) {
      const c = counts(buildEarSession('interval', POOL, rows, NOW, 6, mulberry32(seed)));
      expect(c.second).toBe(2);
      expect(c.third).toBe(2);
      expect(c.fourth).toBe(1);
      expect(c.fifth).toBe(1);
    }
  });

  it('is deterministic for a seed and total on odd counts', () => {
    const rows = [row('third')];
    expect(buildEarSession('interval', POOL, rows, NOW, 10, mulberry32(3))).toEqual(
      buildEarSession('interval', POOL, rows, NOW, 10, mulberry32(3)),
    );
    expect(buildEarSession('interval', POOL, rows, NOW, 0, mulberry32(3))).toEqual([]);
    expect(buildEarSession('interval', [], rows, NOW, 5, mulberry32(3))).toEqual([]);
    expect(buildEarSession('interval', POOL, rows, Number.NaN, 4, mulberry32(3))).toHaveLength(4);
  });

  it('deals chord qualities from chord items', () => {
    const rows: CardRow[] = [{ ...row('x'), cardId: 'ear:chord:minor' }];
    const qs = buildEarSession('chord', ['major', 'minor'], rows, NOW, 4, mulberry32(2));
    expect(counts(qs)).toEqual({ major: 2, minor: 2 });
  });
});

describe('earReviews', () => {
  const qs: Question[] = [
    { kind: 'interval', notes: [60, 64], answer: 'third' },
    { kind: 'chord', notes: [60, 63, 67], answer: 'minor' },
    { kind: 'interval', notes: [60, 67], answer: 'fifth' },
  ];

  it('grades each question from its first answer, in the order asked', () => {
    const out = earReviews(
      qs,
      [
        { card: qs[0]!, right: true },
        { card: qs[1]!, right: false },
        { card: qs[2]!, right: true },
      ],
      { 0: 1500, 1: 400, 2: 15000 },
    );
    expect(out).toEqual([
      { cardId: 'ear:interval:third', grade: 'easy' },
      { cardId: 'ear:chord:minor', grade: 'again' },
      { cardId: 'ear:interval:fifth', grade: 'hard' },
    ]);
  });

  it('gives an untimed right answer good', () => {
    expect(earReviews(qs, [{ card: qs[0]!, right: true }], {})[0]!.grade).toBe('good');
    expect(earReviews(qs, [{ card: qs[0]!, right: true }], { 0: null })[0]!.grade).toBe('good');
  });

  it('names the item a question stands for', () => {
    expect(earItemOf(qs[1]!)).toBe('ear:chord:minor');
  });
});

describe('msSinceHeard', () => {
  it('counts from the sound, and is null when the sound never started', () => {
    expect(msSinceHeard(1000, 4200)).toBe(3200);
    expect(msSinceHeard(1000, 900)).toBe(0);
    expect(msSinceHeard(null, 4200)).toBeNull();
    expect(msSinceHeard(Number.NaN, 4200)).toBeNull();
  });
});
