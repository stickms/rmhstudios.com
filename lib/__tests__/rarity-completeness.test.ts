/**
 * Badge rarity (F7) and profile completeness (B22).
 *
 * Both are small pure modules whose bugs are silent rather than loud: a rarity
 * function that mis-tiers on a boundary makes a common badge render as
 * Legendary (and the profile a lie), and a completeness function that never
 * reaches 100 turns a one-time nudge into a permanent nag. Neither throws.
 */

import { describe, it, expect } from 'vitest';
import {
  rarityTier,
  rarityClass,
  formatRarity,
  sortByRarity,
  MAX_SHOWCASED_BADGES,
  type RarityRow,
} from '@/lib/achievements/rarity';
import { completeness, completenessSteps, STEP_REWARD_COINS } from '@/lib/profile/completeness';

describe('rarityTier', () => {
  it('tiers by holder fraction', () => {
    expect(rarityTier(0.9)).toBe('common');
    expect(rarityTier(0.2)).toBe('uncommon');
    expect(rarityTier(0.05)).toBe('rare');
    expect(rarityTier(0.01)).toBe('epic');
    expect(rarityTier(0.001)).toBe('legendary');
  });

  it('is inclusive at every boundary', () => {
    // Off-by-one here is the whole bug class: a 25.0% badge must be common,
    // not uncommon.
    expect(rarityTier(0.25)).toBe('common');
    expect(rarityTier(0.1)).toBe('uncommon');
    expect(rarityTier(0.02)).toBe('rare');
    expect(rarityTier(0.005)).toBe('epic');
  });

  it('treats an uncomputed or nonsense value as common, never legendary', () => {
    // The dangerous default: an achievement whose rarity has not been rolled up
    // yet must not outrank every real badge on someone's profile.
    expect(rarityTier(Number.NaN)).toBe('common');
    expect(rarityTier(-1)).toBe('common');
    expect(rarityTier(Number.POSITIVE_INFINITY)).toBe('common');
  });

  it('returns only glass elevation classes, never a raw colour', () => {
    // The design test rejects raw palette values in components; keeping the
    // rarity treatment on the glass tiers is what keeps this renderable in the
    // light and high-contrast themes too.
    for (const pct of [0.9, 0.2, 0.05, 0.01, 0.0001]) {
      expect(rarityClass(rarityTier(pct))).toMatch(/^glass-(fill|pane|overlay)$/);
    }
  });
});

describe('formatRarity', () => {
  it('collapses the long tail rather than showing noise digits', () => {
    expect(formatRarity(0.0004)).toBe('<0.1%');
    expect(formatRarity(0.037)).toBe('3.7%');
    expect(formatRarity(0.42)).toBe('42%');
  });

  it('renders an em dash for no data instead of 0%', () => {
    expect(formatRarity(0)).toBe('—');
    expect(formatRarity(Number.NaN)).toBe('—');
  });
});

describe('sortByRarity', () => {
  const rarity = new Map<string, RarityRow>([
    ['common-one', { achievementId: 'common-one', holders: 900, pct: 0.9 }],
    ['rare-one', { achievementId: 'rare-one', holders: 20, pct: 0.02 }],
    ['epic-one', { achievementId: 'epic-one', holders: 4, pct: 0.004 }],
  ]);

  it('puts the rarest first', () => {
    const sorted = sortByRarity(
      [{ achievementId: 'common-one' }, { achievementId: 'epic-one' }, { achievementId: 'rare-one' }],
      rarity,
    );
    expect(sorted.map((s) => s.achievementId)).toEqual(['epic-one', 'rare-one', 'common-one']);
  });

  it('is stable for equal rarity, so badges do not reshuffle between renders', () => {
    const tie = new Map<string, RarityRow>([
      ['b', { achievementId: 'b', holders: 5, pct: 0.05 }],
      ['a', { achievementId: 'a', holders: 5, pct: 0.05 }],
    ]);
    const input = [{ achievementId: 'b' }, { achievementId: 'a' }];
    const first = sortByRarity(input, tie).map((s) => s.achievementId);
    for (let i = 0; i < 10; i++) {
      expect(sortByRarity(input, tie).map((s) => s.achievementId)).toEqual(first);
    }
  });

  it('sorts unknown achievements last rather than dropping them', () => {
    const sorted = sortByRarity([{ achievementId: 'ghost' }, { achievementId: 'epic-one' }], rarity);
    expect(sorted.map((s) => s.achievementId)).toEqual(['epic-one', 'ghost']);
  });

  it('caps the showcase at a governable number', () => {
    expect(MAX_SHOWCASED_BADGES).toBeGreaterThan(0);
    expect(MAX_SHOWCASED_BADGES).toBeLessThanOrEqual(10);
  });
});

describe('completeness', () => {
  const empty = {
    image: null,
    bio: null,
    linkCount: 0,
    postCount: 0,
    followingCount: 0,
    themeId: null,
  };
  const full = {
    image: 'https://cdn/x.png',
    bio: 'A bio comfortably past the twenty character minimum.',
    linkCount: 2,
    postCount: 4,
    followingCount: 9,
    themeId: 'nocturne',
  };

  it('is 0 for a brand new account and 100 for a finished one', () => {
    expect(completeness(empty).percent).toBe(0);
    expect(completeness(full).percent).toBe(100);
    expect(completeness(full).complete).toBe(true);
  });

  it('stops suggesting anything once complete — the meter has an end state', () => {
    expect(completeness(full).next).toBeNull();
  });

  it('suggests the highest-weight unfinished step, not the first', () => {
    // Only the avatar is done. The first post (25) outweighs the bio (15).
    const next = completeness({ ...empty, image: 'x' }).next;
    expect(next?.id).toBe('first-post');
  });

  it('rejects a token bio', () => {
    const steps = completenessSteps({ ...empty, bio: 'hi' });
    expect(steps.find((s) => s.id === 'bio')?.done).toBe(false);
  });

  it('weights sum to 100 so the percentage is meaningful', () => {
    const total = completenessSteps(empty).reduce((sum, s) => sum + s.weight, 0);
    expect(total).toBe(100);
  });

  it('declares a reward for every step', () => {
    // A step with no reward is a chore with no payoff — and a reward for a step
    // that does not exist is dead config.
    const ids = completenessSteps(empty).map((s) => s.id).sort();
    expect(Object.keys(STEP_REWARD_COINS).sort()).toEqual(ids);
  });

  it('never exceeds 100 or dips below 0', () => {
    const odd = { ...full, followingCount: 10_000, postCount: 10_000, linkCount: 99 };
    expect(completeness(odd).percent).toBe(100);
    expect(completeness(empty).percent).toBeGreaterThanOrEqual(0);
  });
});
