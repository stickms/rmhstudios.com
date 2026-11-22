import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import type { CardRow } from './content/practice';
import {
  arrange,
  buildIntervalSession,
  intervalItemOf,
  intervalReviews,
  makeIntervalQuestion,
} from './interval-review';
import { DAY_MS } from './srs/schedule';
import { intervalItemId } from './srs/items';
import { staffIntervalLesson, stepsBetween, semitonesBetween, semitonesOf, SIZE_STEPS } from './theory/staff-intervals';
import type { IntervalQuestion } from './theory/staff-intervals';

const lesson = (id: string) => staffIntervalLesson(id)!;
const NOW = Date.UTC(2026, 10, 22, 12);

const row = (cardId: string, over: Partial<CardRow> = {}): CardRow => ({
  cardId,
  due: new Date(NOW + 5 * DAY_MS).toISOString(),
  lastReviewAt: new Date(NOW - DAY_MS).toISOString(),
  stability: 6,
  difficulty: 5,
  reps: 3,
  lapses: 0,
  ...over,
});

describe('a question', () => {
  it('is written as the lesson says, and is what its answer names', () => {
    for (const id of [
      'intervals-read-all-sizes',
      'intervals-read-seconds-thirds-quality',
      'intervals-read-quality-wider',
    ]) {
      const l = lesson(id);
      const rand = mulberry32(7);
      for (const name of l.pool)
        for (const dir of l.directions) {
          const q = makeIntervalQuestion(l, name, dir, rand)!;
          expect(q, `${id} ${dir} ${name}`).not.toBeNull();
          expect(q.answer).toBe(name);
          expect(q.direction).toBe(dir);
          expect(l.clefs).toContain(q.clef);
          if (l.tier === 'size') expect(stepsBetween(q)).toBe(SIZE_STEPS[name as keyof typeof SIZE_STEPS]);
          else expect(semitonesBetween(q)).toBe(semitonesOf(name as never));
        }
    }
  });

  it('is never the same notes as the one before, when there are others', () => {
    const l = lesson('intervals-read-second-third');
    const rand = mulberry32(3);
    let prev: IntervalQuestion | undefined;
    for (let i = 0; i < 60; i++) {
      const q = makeIntervalQuestion(l, 'third', 'up', rand, prev)!;
      if (prev) expect([q.first.written, q.second.written]).not.toEqual([prev.first.written, prev.second.written]);
      prev = q;
    }
  });
});

describe('buildIntervalSession', () => {
  it('deals ten questions, every item as often as the others (within one), and is the same for the same seed', () => {
    const l = lesson('intervals-read-seconds-thirds-quality'); // 4 names x 2 directions = 8 items
    const a = buildIntervalSession(l, [], NOW, 10, mulberry32(11));
    const b = buildIntervalSession(l, [], NOW, 10, mulberry32(11));
    expect(a).toHaveLength(10);
    expect(a).toEqual(b);
    const counts = new Map<string, number>();
    for (const q of a) counts.set(intervalItemOf(q), (counts.get(intervalItemOf(q)) ?? 0) + 1);
    expect(counts.size).toBe(8);
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
    expect([...counts.values()].filter((n) => n === 2)).toHaveLength(2);
  });

  it('never asks the same item twice in a row while another is available', () => {
    const l = lesson('intervals-read-fourth-fifth-octave'); // 4 items, up only
    for (let seed = 1; seed <= 40; seed++) {
      const qs = buildIntervalSession(l, [], NOW, 10, mulberry32(seed));
      for (let i = 1; i < qs.length; i++) expect(intervalItemOf(qs[i]!)).not.toBe(intervalItemOf(qs[i - 1]!));
    }
  });

  it('gives the extra questions to the due items first, then the unseen ones, then the weakest', () => {
    const l = lesson('intervals-read-fourth-fifth-octave'); // third, fourth, fifth, octave, up
    const id = (n: Parameters<typeof intervalItemId>[1]) => intervalItemId('up', n);
    const rows = [
      row(id('third')), // remembered, not due
      row(id('fourth'), {
        due: new Date(NOW - 2 * DAY_MS).toISOString(),
        lastReviewAt: new Date(NOW - 8 * DAY_MS).toISOString(),
      }), // due
      row(id('octave'), { stability: 0.5, lastReviewAt: new Date(NOW - 3 * DAY_MS).toISOString() }), // not due? weak
      // 'fifth' has no row: never seen
    ];
    const extras = (seed: number) => {
      const qs = buildIntervalSession(l, rows, NOW, 6, mulberry32(seed)); // 4 items: two get a second question
      const counts = new Map<string, number>();
      for (const q of qs) counts.set(q.answer, (counts.get(q.answer) ?? 0) + 1);
      return [...counts].filter(([, n]) => n === 2).map(([a]) => a);
    };
    for (let seed = 1; seed <= 15; seed++) {
      const two = extras(seed);
      expect(two).toHaveLength(2);
      expect(two).toContain('fourth'); // the due one
      expect(two).toContain('fifth'); // then the unseen one
    }
  });

  it('asks nothing of a count that is not a count', () => {
    const l = lesson('intervals-read-second-third');
    for (const bad of [0, -3, Number.NaN]) expect(buildIntervalSession(l, [], NOW, bad, mulberry32(1))).toEqual([]);
    expect(buildIntervalSession(l, [], Number.NaN, 4, mulberry32(1))).toHaveLength(4);
  });
});

describe('intervalReviews', () => {
  const q = (answer: IntervalQuestion['answer'], direction: 'up' | 'down' = 'up'): IntervalQuestion => ({
    clef: 'treble',
    direction,
    first: { written: 60, accidental: 0 },
    second: { written: 64, accidental: 0 },
    answer,
  });

  it('grades the first answer by speed, and a miss as again whatever came after', () => {
    const r = intervalReviews([
      { card: q('third'), right: true, ms: 1800 },
      { card: q('fifth'), right: true, ms: 5000 },
      { card: q('second'), right: true, ms: 15000 },
      { card: q('fourth'), right: false, ms: 400 },
      { card: q('octave'), right: true },
    ]);
    expect(r).toEqual([
      { cardId: 'int:up:third', grade: 'easy' },
      { cardId: 'int:up:fifth', grade: 'good' },
      { cardId: 'int:up:second', grade: 'hard' },
      { cardId: 'int:up:fourth', grade: 'again' },
      { cardId: 'int:up:octave', grade: 'good' },
    ]);
  });

  it('keeps the worse grade when one item was asked twice, and tells directions apart', () => {
    const r = intervalReviews([
      { card: q('third'), right: true, ms: 1000 },
      { card: q('third'), right: false },
      { card: q('third', 'down'), right: true, ms: 1000 },
    ]);
    expect(r).toEqual([
      { cardId: 'int:up:third', grade: 'again' },
      { cardId: 'int:down:third', grade: 'easy' },
    ]);
  });

  it('posts at most one batch', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      card: q(
        ['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'][i % 7] as never,
        i % 2 ? 'up' : 'down',
      ),
      right: true,
    }));
    expect(intervalReviews(many).length).toBeLessThanOrEqual(50);
  });
});

describe('arrange', () => {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join('');
  const of = (s: string) => [...s].map((id) => ({ id }));

  it('keeps every item and never puts one next to itself when that is possible', () => {
    for (const set of ['aabb', 'aaabbb', 'aabbcc', 'aaabbbccc', 'aabbccd', 'aaabbc', 'abab', 'aaabcde']) {
      for (let seed = 1; seed <= 60; seed++) {
        const out = arrange(of(set), mulberry32(seed));
        expect([...ids(out)].sort().join('')).toBe([...set].sort().join(''));
        for (let i = 1; i < out.length; i++)
          expect(out[i]!.id, `${set} seed ${seed}: ${ids(out)}`).not.toBe(out[i - 1]!.id);
      }
    }
  });

  it('copes with what cannot be arranged: one item, or far too many of one', () => {
    expect(ids(arrange(of('aaa'), mulberry32(1)))).toBe('aaa');
    const out = arrange(of('aaaab'), mulberry32(1));
    expect([...ids(out)].sort().join('')).toBe('aaaab');
    expect(arrange([], mulberry32(1))).toEqual([]);
  });
});
