import { describe, expect, it } from 'vitest';
import { binObs, inviteChance, kaplanMeier, maxDayOf, observationOf, survivalAt, weekCeil, type Obs } from './km';

const e = (days: number): Obs => ({ days, event: true });
const c = (days: number): Obs => ({ days, event: false });
const textbook = [e(2), e(3), c(3), e(5), c(8)];

describe('kaplanMeier', () => {
  it('matches the textbook case, events before censorings at a tie', () => {
    expect(kaplanMeier(textbook)).toEqual({ t: [2, 3, 5], s: [0.8, 0.6, 0.3], n: [5, 4, 2] });
  });
  it('does not depend on input order', () => {
    expect(kaplanMeier([...textbook].reverse())).toEqual(kaplanMeier(textbook));
    expect(kaplanMeier([textbook[3]!, textbook[0]!, textbook[4]!, textbook[2]!, textbook[1]!])).toEqual(
      kaplanMeier(textbook),
    );
  });
  it('all censored: no steps, survival 1', () => {
    const k = kaplanMeier([c(4), c(9)]);
    expect(k).toEqual({ t: [], s: [], n: [] });
    expect(survivalAt(k, 100)).toBe(1);
  });
  it('everyone invited on day 0', () => {
    expect(kaplanMeier([e(0), e(0), e(0), e(0), e(0)])).toEqual({ t: [0], s: [0], n: [5] });
  });
  it('caps a wait over 180 days: censored at 180, never a step past it', () => {
    const k = kaplanMeier([e(400), e(10)]);
    expect(k.t).toEqual([10]);
    expect(Math.max(...k.t)).toBeLessThanOrEqual(180);
  });
  it('records the number at risk at each step', () => {
    expect(kaplanMeier([e(7), e(7), c(7), e(14), c(21), c(21)]).n).toEqual([6, 3]);
  });
  it('survivalAt is 1 before the first step and the step value from it on', () => {
    const k = kaplanMeier(textbook);
    expect(survivalAt(k, 1)).toBe(1);
    expect(survivalAt(k, 2)).toBe(0.8);
    expect(survivalAt(k, 4)).toBe(0.6);
    expect(survivalAt(k, 99)).toBe(0.3);
  });
});

describe('observationOf', () => {
  const asOf = '2026-11-23';
  const base = { completeOn: '2026-11-01', inviteOn: null, endOn: null };
  it('invited', () =>
    expect(observationOf({ ...base, inviteOn: '2026-11-11' }, asOf)).toEqual({ days: 10, event: true }));
  it('rejected before any invite is censored, not an event', () =>
    expect(observationOf({ ...base, endOn: '2026-11-09' }, asOf)).toEqual({ days: 8, event: false }));
  it('still waiting is censored at asOf', () => expect(observationOf(base, asOf)).toEqual({ days: 22, event: false }));
  it('an invite before COMPLETE is dropped', () =>
    expect(observationOf({ ...base, inviteOn: '2026-10-30' }, asOf)).toBeNull());
  it('an end date before COMPLETE drops the observation, as an invite before COMPLETE does', () => {
    expect(observationOf({ ...base, endOn: '2026-10-30' }, asOf)).toBeNull();
    expect(observationOf({ ...base, inviteOn: '2026-11-05', endOn: '2026-10-30' }, asOf)).toBeNull();
    // On the complete day itself it is a (zero-day) censoring.
    expect(observationOf({ ...base, endOn: '2026-11-01' }, asOf)).toEqual({ days: 0, event: false });
  });
  it('a COMPLETE after asOf is dropped', () =>
    expect(observationOf({ ...base, completeOn: '2026-11-24' }, asOf)).toBeNull());
  it('the invite wins over a later end date', () =>
    expect(observationOf({ ...base, inviteOn: '2026-11-05', endOn: '2026-11-09' }, asOf)).toEqual({
      days: 4,
      event: true,
    }));
  it('an invite dated after asOf has not happened', () =>
    expect(observationOf({ ...base, inviteOn: '2026-12-01' }, asOf)).toEqual({ days: 22, event: false }));
  it('a 200-day gap is censored at 180', () =>
    expect(observationOf({ completeOn: '2026-01-01', inviteOn: '2026-07-20', endOn: null }, asOf)).toEqual({
      days: 180,
      event: false,
    }));
});

describe('weekly bins (R13)', () => {
  it('rounds a time up to whole weeks', () => {
    expect([0, 1, 7, 8, 14, 15, 180].map(weekCeil)).toEqual([0, 7, 7, 14, 14, 21, 182]);
    expect(binObs({ days: 10, event: true })).toEqual({ days: 14, event: true });
  });
  it('a curve of binned observations has steps only at multiples of 7', () => {
    const k = kaplanMeier([3, 9, 10, 16, 25, 40, 41].map((d) => binObs(e(d))).concat([binObs(c(60))]));
    expect(k.t.length).toBeGreaterThan(2);
    for (const t of k.t) expect(t % 7).toBe(0);
  });
});

describe('maxDayOf: the last week with at least 10 at risk', () => {
  const many = (days: number, n: number, event = false): Obs[] => Array.from({ length: n }, () => ({ days, event }));
  it('is the last week where 10 or more are still at risk', () => {
    const obs = [...many(14, 3, true), ...many(28, 4), ...many(42, 10), ...many(70, 2)];
    // at risk: week 14 -> 19, 28 -> 16, 42 -> 12, 56 -> 2
    expect(maxDayOf(obs)).toBe(42);
  });
  it('never passes the 180-day cap week and is 0 when even week 7 is thin', () => {
    expect(maxDayOf(many(182, 30))).toBe(182);
    expect(maxDayOf(many(5, 9))).toBe(0);
  });
});

describe('inviteChance', () => {
  // 20 members: 4 invited in week 1, 4 in week 3, 4 in week 6; the rest wait to week 12.
  const obs: Obs[] = [...Array(4).fill(e(7)), ...Array(4).fill(e(21)), ...Array(4).fill(e(42)), ...Array(8).fill(c(84))];
  const k = kaplanMeier(obs);
  const max = maxDayOf(obs);
  it('max day is the last week with 10 at risk', () => expect(max).toBe(42));
  it('is the same for every day of a week, and conditions on none by that week', () => {
    const a = inviteChance(k, max, 8, 14); // week 14, target 28
    expect(a).toBe(inviteChance(k, max, 14, 14));
    expect(a).toBe(inviteChance(k, max, 9, 14));
    const s14 = survivalAt(k, 14);
    const s28 = survivalAt(k, 28);
    expect(a).toBe(Math.round(((1 - s28 / s14) * 100) / 5) * 0.05);
  });
  it('rounds to the nearest 5 percent', () => {
    for (let el = 0; el <= 42; el++)
      for (const h of [7, 14, 30]) {
        const v = inviteChance(k, max, el, h);
        if (v !== null) expect(Math.round(v * 100) % 5).toBe(0);
      }
    // 0.8 -> 0.6667 over the step: 1 - 0.6/0.8 = 25%
    expect(inviteChance(k, max, 14, 14)).toBe(0.25);
  });
  it('is null when the target week passes maxDay, which is also where fewer than 10 are at risk', () => {
    expect(inviteChance(k, max, 8, 14)).not.toBeNull();
    expect(inviteChance(k, max, 36, 7)).toBeNull(); // week 42 + 7 = 49 > 42
    expect(inviteChance(k, max, 43, 7)).toBeNull(); // week 49 itself has under 10 at risk
  });
  it('is null when nobody comparable is still waiting', () => {
    const thin = { t: [7], s: [0.01], n: [30] };
    expect(inviteChance(thin, 70, 8, 7)).toBeNull();
  });
  it('stays in [0, 1]', () => {
    for (let el = 0; el <= 50; el++)
      for (const h of [1, 7, 14]) {
        const v = inviteChance(k, max, el, h);
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
  });
});
