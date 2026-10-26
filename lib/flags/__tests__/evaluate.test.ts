import { describe, expect, it } from 'vitest';
import { bucketFor, evaluateFlag } from '../evaluate';

const flag = (rolloutPercent: number, enabled = true) => ({
  key: 'new-checkout',
  enabled,
  rolloutPercent,
});

describe('evaluateFlag', () => {
  it('is off for a missing or disabled flag, whatever the percentage', () => {
    expect(evaluateFlag(undefined, 'u1')).toBe(false);
    expect(evaluateFlag(flag(100, false), 'u1')).toBe(false);
  });
  it('is on for everyone, anonymous included, at 100%', () => {
    expect(evaluateFlag(flag(100), null)).toBe(true);
    expect(evaluateFlag(flag(100), 'u1')).toBe(true);
  });
  it('is off at 0% and for anonymous callers in a partial rollout', () => {
    expect(evaluateFlag(flag(0), 'u1')).toBe(false);
    expect(evaluateFlag(flag(50), null)).toBe(false);
  });
  it('buckets a user stably and in proportion to the rollout', () => {
    expect(bucketFor('a', 'u1')).toBe(bucketFor('a', 'u1'));
    const users = Array.from({ length: 5000 }, (_, i) => `user-${i}`);
    const on = users.filter((id) => evaluateFlag(flag(25), id)).length;
    expect(on / users.length).toBeGreaterThan(0.22);
    expect(on / users.length).toBeLessThan(0.28);
  });
  it('grows a rollout monotonically: users on at 10% stay on at 50%', () => {
    const users = Array.from({ length: 500 }, (_, i) => `user-${i}`);
    for (const id of users)
      if (evaluateFlag(flag(10), id)) expect(evaluateFlag(flag(50), id)).toBe(true);
  });
  it('salts by key so flags do not share the same early adopters', () => {
    const users = Array.from({ length: 500 }, (_, i) => `user-${i}`);
    const same = users.filter((id) => bucketFor('a', id) === bucketFor('b', id)).length;
    expect(same).toBeLessThan(50);
  });
  it('clamps out-of-range percentages', () => {
    expect(evaluateFlag(flag(250), null)).toBe(true);
    expect(evaluateFlag(flag(-5), 'u1')).toBe(false);
  });
});
