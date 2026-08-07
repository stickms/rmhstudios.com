/**
 * P7, S4, S11, S12 and M8 — the session reducer.
 *
 * The assertions that matter are the ones about what ENDS a session, because
 * that is the only thing separating the four modes and it is where a shared
 * reducer would otherwise quietly do the wrong thing for three of them.
 */

import { describe, expect, it } from 'vitest';
import {
  advanceSession,
  endlessStep,
  nextRating,
  pickNextChart,
  startSession,
  stopSession,
  weekKeyOf,
  weeklyModifierKeys,
  type SessionRun,
} from '../session';

const cleared = (accuracy = 0.95): SessionRun => ({
  accuracy,
  cleared: true,
  score: 1000,
  duration: 120,
});
const failed: SessionRun = { accuracy: 0.4, cleared: false, score: 200, duration: 40 };

describe('P7 — the adaptive ladder', () => {
  it('drops further on a failure than it climbs on a clear', () => {
    // Asymmetric on purpose: a plateau that takes four clears to escape reads
    // as a wall, one that takes four failures to fall out of reads as the game
    // paying attention.
    const up = nextRating(10, cleared(0.99)) - 10;
    const down = 10 - nextRating(10, failed);
    expect(down).toBeGreaterThan(up);
  });

  it('does not move for a scrappy clear', () => {
    expect(nextRating(10, cleared(0.85))).toBe(10);
  });

  it('stays inside the C3 rating scale', () => {
    expect(nextRating(20, cleared(0.99))).toBeLessThanOrEqual(20);
    expect(nextRating(1, failed)).toBeGreaterThanOrEqual(1);
  });
});

describe('S4 — endless', () => {
  it('escalates difficulty AND drain together', () => {
    // Only difficulty and a strong player never dies; only drain and it is a
    // timer with music over it.
    const early = endlessStep(1, 8);
    const late = endlessStep(16, 8);
    expect(late.targetRating).toBeGreaterThan(early.targetRating);
    expect(late.drainMultiplier).toBeGreaterThan(early.drainMultiplier);
  });

  it('ends on the first failure', () => {
    const state = advanceSession(startSession('endless', 8), 'c1', failed);
    expect(state.ended).toBe('failed');
  });

  it('refuses to advance once ended', () => {
    const dead = advanceSession(startSession('endless', 8), 'c1', failed);
    const after = advanceSession(dead, 'c2', cleared());
    expect(after).toBe(dead);
  });
});

describe('S11 / S12 — marathon and time attack', () => {
  it('marathon never ends on its own', () => {
    let state = startSession('marathon', 8);
    for (const id of ['a', 'b', 'c']) state = advanceSession(state, id, failed);
    expect(state.ended).toBeNull();
    expect(stopSession(state).ended).toBe('stopped');
  });

  it('time attack banks the run that crosses the limit', () => {
    // The clock expiring mid-song must not discard that song: the player did
    // not choose its length, and losing it would punish them for the pick.
    const state = advanceSession(startSession('timeAttack', 8), 'a', cleared(), {
      timeLimit: 100,
    });
    expect(state.ended).toBe('time');
    expect(state.score).toBe(1000);
    expect(state.history).toEqual(['a']);
  });

  it('keeps going while there is time left', () => {
    const state = advanceSession(startSession('timeAttack', 8), 'a', cleared(), {
      timeLimit: 600,
    });
    expect(state.ended).toBeNull();
  });
});

describe('pickNextChart', () => {
  const pool = [
    { id: 'easy', rating: 3 },
    { id: 'mid', rating: 8 },
    { id: 'hard', rating: 14 },
    { id: 'unrated', rating: null },
  ];

  it('never repeats a chart from this session', () => {
    let state = startSession('marathon', 8);
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      const id = pickNextChart(state, pool, 'seed');
      expect(id).not.toBeNull();
      expect(seen.has(id!)).toBe(false);
      seen.add(id!);
      state = advanceSession(state, id!, cleared());
    }
    expect(pickNextChart(state, pool, 'seed')).toBeNull();
  });

  it('picks near the target rating in laddered modes', () => {
    const state = startSession('warmup', 14);
    // The band is the closest few, so the pick is not deterministic — but it
    // must never be the far end of the pool.
    const id = pickNextChart(state, pool, 'seed');
    expect(id).not.toBe('easy');
  });

  it('still produces a session from an entirely unrated pool', () => {
    const state = startSession('warmup', 8);
    const id = pickNextChart(state, [{ id: 'only', rating: null }], 'seed');
    expect(id).toBe('only');
  });

  it('is reproducible from its seed', () => {
    const state = startSession('marathon', 8);
    expect(pickNextChart(state, pool, 'seed-a')).toBe(pickNextChart(state, pool, 'seed-a'));
  });
});

describe('M8 — the weekly modifier roulette', () => {
  it('is a pure function of the week key', () => {
    expect(weeklyModifierKeys('2026-W32')).toEqual(weeklyModifierKeys('2026-W32'));
  });

  it('changes between weeks', () => {
    const weeks = new Set(
      Array.from({ length: 12 }, (_, i) => weeklyModifierKeys(`2026-W${i + 1}`).join(',')),
    );
    expect(weeks.size).toBeGreaterThan(1);
  });

  it('always picks exactly two, and never the same one twice', () => {
    for (let i = 1; i <= 20; i++) {
      const keys = weeklyModifierKeys(`2026-W${i}`);
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(2);
    }
  });

  it('puts the last days of December in the right ISO year', () => {
    // 2026-12-31 is a Thursday, so it belongs to week 53 of 2026 — a naive
    // day-of-year division puts it in week 1 of 2027 and the rotation jumps.
    expect(weekKeyOf(new Date('2026-12-31T00:00:00Z'))).toBe('2026-W53');
    // 2027-01-01 is a Friday, still ISO week 53 of 2026.
    expect(weekKeyOf(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });
});
