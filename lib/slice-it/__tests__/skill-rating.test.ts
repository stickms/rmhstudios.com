/**
 * The R2 skill weighting — `skillRating()` in `lib/slice-it/rating.ts`.
 *
 * The defect this exists to prevent is specific and is the whole reason R2 was
 * written: the global board summed `Player.totalScore` across every run, so it
 * ranked **volume played**. The properties below are the ones that make the
 * replacement a skill measure instead, and every one of them is a thing a
 * re-weighting could silently break.
 *
 * As with `rating.test.ts`, no exact values are pinned. The exponent and the
 * decay are judgement calls awaiting real data.
 */

import { describe, it, expect } from 'vitest';
import {
  contributionOf,
  skillRating,
  SKILL_ACCURACY_EXPONENT,
  SKILL_CONTRIBUTION_CAP,
  SKILL_DECAY,
  type SkillContribution,
} from '../rating';

const at = (chartRating: number, accuracy: number): SkillContribution => ({
  chartRating,
  accuracy,
});

/** `n` identical entries, as a player who has cleared `n` charts at one level. */
const many = (n: number, chartRating: number, accuracy: number): SkillContribution[] =>
  Array.from({ length: n }, () => at(chartRating, accuracy));

describe('skillRating', () => {
  it('is 0 for a player with nothing on a ranked chart', () => {
    expect(skillRating([])).toBe(0);
  });

  it('ranks one hard chart above many easy ones — the whole point', () => {
    // The grind: 300 clears of a rating-4 chart, played very well.
    const grinder = many(300, 4, 0.99);
    // The player: 30 charts around rating 16, played well.
    const player = many(30, 16, 0.97);

    expect(skillRating(player)).toBeGreaterThan(skillRating(grinder));
  });

  it('has sharply diminishing returns in the number of charts', () => {
    // Doubling from 50 charts to 100 must not come close to doubling the
    // rating; if it did, the number would be a play counter again.
    const fifty = skillRating(many(50, 12, 0.96));
    const hundred = skillRating(many(100, 12, 0.96));

    expect(hundred).toBeGreaterThan(fifty);
    expect(hundred).toBeLessThan(fifty * 1.2);
  });

  it('rewards accuracy steeply at the top of the range', () => {
    const good = skillRating([at(15, 0.96)]);
    const great = skillRating([at(15, 0.99)]);

    // 3 accuracy points near the ceiling is a large difference, not a 3% one.
    expect(great).toBeGreaterThan(good * 1.3);
  });

  it('is monotone in chart rating at fixed accuracy', () => {
    const ratings = [2, 6, 10, 14, 18].map((r) => skillRating([at(r, 0.97)]));
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
  });

  it('is monotone in accuracy at fixed chart rating', () => {
    const accuracies = [0.7, 0.85, 0.95, 0.99, 1].map((a) => skillRating([at(12, a)]));
    expect(accuracies).toEqual([...accuracies].sort((a, b) => a - b));
  });

  it('does not depend on the order it is given', () => {
    const entries = [at(4, 0.99), at(18, 0.95), at(11, 0.88), at(15, 0.97)];
    expect(skillRating([...entries].reverse())).toBeCloseTo(skillRating(entries), 9);
  });

  it('does not mutate its input', () => {
    const entries = [at(4, 0.9), at(18, 0.95), at(11, 0.88)];
    const before = entries.map((e) => e.chartRating);
    skillRating(entries);
    expect(entries.map((e) => e.chartRating)).toEqual(before);
  });

  it('ignores entries past the contribution cap', () => {
    // The cap is a query bound, not a scoring rule: past it the decay has
    // already taken the value to nothing, so adding more must change nothing
    // observable.
    const capped = many(SKILL_CONTRIBUTION_CAP, 10, 0.95);
    const overflowing = many(SKILL_CONTRIBUTION_CAP + 500, 10, 0.95);
    expect(skillRating(overflowing)).toBeCloseTo(skillRating(capped), 6);
  });

  it('clamps out-of-range accuracy rather than producing a larger rating', () => {
    // A submission is clamped to 0–1 before it is stored, but a historical row
    // or a bug must not be able to mint rating out of an accuracy above 1.
    expect(skillRating([at(10, 1.5)])).toBe(skillRating([at(10, 1)]));
    expect(skillRating([at(10, -1)])).toBe(0);
  });

  it('treats a negative chart rating as zero rather than subtracting', () => {
    expect(skillRating([at(-5, 0.99)])).toBe(0);
  });

  it('never produces NaN from a malformed entry', () => {
    expect(Number.isFinite(skillRating([at(Number.NaN, 0.9)]))).toBe(true);
    expect(Number.isFinite(skillRating([at(10, Number.NaN)]))).toBe(true);
  });
});

describe('contributionOf', () => {
  it('orders entries the same way the sum does', () => {
    // `collectContributions` picks the best row per chart with this function,
    // and then `skillRating` sorts by the same quantity. If the two disagreed,
    // "best per chart" would pick a row the sum then ranks below another.
    const a = at(16, 0.9);
    const b = at(12, 0.99);

    const order = contributionOf(a) > contributionOf(b);
    expect(skillRating([a]) > skillRating([b])).toBe(order);
  });

  it('is not the same order as raw score would give', () => {
    // The reason "best per chart" is by contribution and not by score: a
    // higher-scoring run with worse accuracy is worth less here.
    expect(contributionOf(at(14, 0.999))).toBeGreaterThan(contributionOf(at(14, 0.93)));
  });
});

describe('the constants', () => {
  it('decays but does not vanish', () => {
    expect(SKILL_DECAY).toBeGreaterThan(0);
    expect(SKILL_DECAY).toBeLessThan(1);
  });

  it('weights accuracy super-linearly', () => {
    // At 1 the rating would be linear in accuracy, which is the claim that 99%
    // is 1.03x as good as 96%. It is not.
    expect(SKILL_ACCURACY_EXPONENT).toBeGreaterThan(1);
  });

  it('caps far past the point where decay has taken over', () => {
    expect(Math.pow(SKILL_DECAY, SKILL_CONTRIBUTION_CAP)).toBeLessThan(1e-6);
  });
});
