import { describe, expect, it } from 'vitest';
import { inviteChance, kaplanMeier, maxDayOf, observationOf, survivalAt, type Obs } from './km';

const e = (days: number): Obs => ({ days, event: true });
const c = (days: number): Obs => ({ days, event: false });
const textbook = [e(2), e(3), c(3), e(5), c(8)];

describe('kaplanMeier', () => {
  it('matches the textbook case, events before censorings at a tie', () => {
    expect(kaplanMeier(textbook)).toEqual({ t: [2, 3, 5], s: [0.8, 0.6, 0.3] });
  });
  it('does not depend on input order', () => {
    expect(kaplanMeier([...textbook].reverse())).toEqual(kaplanMeier(textbook));
    expect(kaplanMeier([textbook[3]!, textbook[0]!, textbook[4]!, textbook[2]!, textbook[1]!])).toEqual(
      kaplanMeier(textbook),
    );
  });
  it('all censored: no steps, survival 1', () => {
    const k = kaplanMeier([c(4), c(9)]);
    expect(k).toEqual({ t: [], s: [] });
    expect(survivalAt(k, 100)).toBe(1);
  });
  it('everyone invited on day 0', () => {
    expect(kaplanMeier([e(0), e(0), e(0), e(0), e(0)])).toEqual({ t: [0], s: [0] });
  });
  it('caps a wait over 180 days: censored at 180, never a step past it', () => {
    const k = kaplanMeier([e(400), e(10)]);
    expect(k.t).toEqual([10]);
    expect(Math.max(...k.t)).toBeLessThanOrEqual(180);
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

describe('inviteChance', () => {
  const k = kaplanMeier(textbook);
  const max = maxDayOf(k, textbook);
  it('max day is the longest follow-up', () => expect(max).toBe(8));
  it('conditions on none by today', () => {
    expect(inviteChance(k, max, 3, 2)).toBe(0.5);
    expect(inviteChance(k, max, 0, 2)).toBe(0.2);
  });
  it('is null beyond the curve', () => expect(inviteChance(k, max, 3, 6)).toBeNull());
  it('is null when nobody comparable is still waiting', () => {
    const thin = { t: [5], s: [0.01] };
    expect(inviteChance(thin, 10, 6, 2)).toBeNull();
  });
  it('stays in [0, 1]', () => {
    for (let el = 0; el <= 8; el++)
      for (const h of [1, 2, 5]) {
        const v = inviteChance(k, max, el, h);
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
  });
});
