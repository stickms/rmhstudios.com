import { describe, expect, it } from 'vitest';
import {
  SS_MAX_SPEED_BONUS,
  generateSequence,
  isOut,
  isPad,
  judgeTap,
  lengthForRound,
  litMsFor,
  matchIsOver,
  scoreRound,
  speedBonus,
} from '../sequence';
import { SEQUENCE_SAM_SETTINGS } from '../settings';
import { validateGameSettings } from '../../game-settings';
import { TapInputSchema } from '../schemas';

function hasTriple(steps: number[]): boolean {
  return steps.some((p, i) => i >= 2 && steps[i - 1] === p && steps[i - 2] === p);
}

describe('generateSequence', () => {
  it('is deterministic for a seed and length', () => {
    expect(generateSequence(42, 10)).toEqual(generateSequence(42, 10));
    expect(generateSequence(42, 10)).not.toEqual(generateSequence(43, 10));
  });

  it('has the length asked for and only pads 0 to 3', () => {
    const steps = generateSequence(7, 11);
    expect(steps).toHaveLength(11);
    for (const pad of steps) expect(isPad(pad)).toBe(true);
  });

  it('never repeats a pad three times in a row, over many seeds and lengths', () => {
    for (let seed = 0; seed < 400; seed++) {
      for (const length of [3, 6, 14, 30]) expect(hasTriple(generateSequence(seed, length))).toBe(false);
    }
  });

  it('uses all four pads across seeds', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 50; seed++) for (const p of generateSequence(seed, 5)) seen.add(p);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('rounds and settings', () => {
  it('starts at three steps and adds one per round', () => {
    expect([0, 1, 2, 7].map(lengthForRound)).toEqual([3, 4, 5, 10]);
  });

  it('lights a pad for 70% of the step', () => {
    expect(litMsFor(600)).toBe(420);
    expect(litMsFor(900)).toBe(630);
  });

  it('keeps the host settings to their ranges, with the step at 600 or 900', () => {
    const clean = validateGameSettings(SEQUENCE_SAM_SETTINGS, { rounds: 50, recallSeconds: 1, stepMs: 700 });
    expect(clean.rounds).toBe(12);
    expect(clean.recallSeconds).toBe(10);
    expect([600, 900]).toContain(clean.stepMs);
    expect(validateGameSettings(SEQUENCE_SAM_SETTINGS, {})).toEqual({ rounds: 8, recallSeconds: 20, stepMs: 600 });
    expect(validateGameSettings(SEQUENCE_SAM_SETTINGS, { stepMs: 900 }).stepMs).toBe(900);
  });
});

describe('judgeTap', () => {
  const sequence = [1, 2, 3];

  it('accepts the next step and counts it', () => {
    expect(judgeTap(sequence, 0, 1)).toEqual({ correct: true, correctSteps: 1, complete: false, finished: false });
    expect(judgeTap(sequence, 1, 2)).toEqual({ correct: true, correctSteps: 2, complete: false, finished: false });
  });

  it('finishes with a complete sequence on the last correct tap', () => {
    expect(judgeTap(sequence, 2, 3)).toEqual({ correct: true, correctSteps: 3, complete: true, finished: true });
  });

  it('ends the round at the steps already right on a wrong tap', () => {
    expect(judgeTap(sequence, 2, 0)).toEqual({ correct: false, correctSteps: 2, complete: false, finished: true });
    expect(judgeTap(sequence, 0, 3)).toEqual({ correct: false, correctSteps: 0, complete: false, finished: true });
  });

  it('judges a tap past the end as wrong without changing the count', () => {
    expect(judgeTap(sequence, 3, 1)).toEqual({ correct: false, correctSteps: 3, complete: true, finished: true });
  });
});

describe('scoring', () => {
  it('scores a correct sequence 100 x length plus the speed bonus', () => {
    expect(scoreRound({ length: 4, correctSteps: 4, completed: true, elapsedMs: 0, recallSeconds: 20 })).toEqual({
      points: 450,
      bonus: 50,
    });
    expect(scoreRound({ length: 4, correctSteps: 4, completed: true, elapsedMs: 10_000, recallSeconds: 20 })).toEqual({
      points: 425,
      bonus: 25,
    });
  });

  it('gives no bonus at or after the end of the recall time', () => {
    expect(speedBonus(20_000, 20)).toBe(0);
    expect(speedBonus(90_000, 20)).toBe(0);
    expect(
      scoreRound({ length: 3, correctSteps: 3, completed: true, elapsedMs: 25_000, recallSeconds: 20 }).points,
    ).toBe(300);
  });

  it('keeps the bonus between 0 and 50 for any elapsed time', () => {
    for (const elapsed of [-500, 0, 1, 999, 10_000, 19_999, 20_000, 1e9]) {
      const bonus = speedBonus(elapsed, 20);
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeLessThanOrEqual(SS_MAX_SPEED_BONUS);
    }
    expect(speedBonus(-500, 20)).toBe(50);
  });

  it('rounds the bonus', () => {
    // 1 - 3000/40000 = 0.925 -> 46.25
    expect(speedBonus(3000, 40)).toBe(46);
  });

  it('scores a miss 60 x the correct steps, with no bonus', () => {
    expect(scoreRound({ length: 5, correctSteps: 3, completed: false, elapsedMs: 1000, recallSeconds: 20 })).toEqual({
      points: 180,
      bonus: 0,
    });
    expect(scoreRound({ length: 5, correctSteps: 0, completed: false, elapsedMs: 0, recallSeconds: 20 }).points).toBe(
      0,
    );
  });
});

describe('the out rule and the end of the match', () => {
  it('puts a player out at their second miss, not the first', () => {
    expect(isOut(0)).toBe(false);
    expect(isOut(1)).toBe(false);
    expect(isOut(2)).toBe(true);
    expect(isOut(3)).toBe(true);
  });

  it('ends after the last round or with one player left', () => {
    expect(matchIsOver(3, 8, 3)).toBe(false);
    expect(matchIsOver(8, 8, 3)).toBe(true);
    expect(matchIsOver(3, 8, 1)).toBe(true);
    expect(matchIsOver(3, 8, 0)).toBe(true);
    expect(matchIsOver(3, 8, 2)).toBe(false);
  });
});

describe('TapInputSchema', () => {
  it('takes pads 0 to 3 and nothing else', () => {
    expect(TapInputSchema.safeParse({ pad: 0 }).success).toBe(true);
    expect(TapInputSchema.safeParse({ type: 'tap', pad: 3 }).success).toBe(true);
    for (const bad of [{ pad: 4 }, { pad: -1 }, { pad: 1.5 }, { pad: '1' }, {}, null]) {
      expect(TapInputSchema.safeParse(bad).success).toBe(false);
    }
  });
});
