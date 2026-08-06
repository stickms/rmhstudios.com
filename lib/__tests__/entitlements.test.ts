import { describe, it, expect, vi } from 'vitest';

// Mock prisma.server so the module loads without a real DATABASE_URL.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  TIER_RANK,
  mapPlanToTier,
  parseTier,
  tierFromSubscription,
  hasAdFree,
  hasApiAccess,
  hasBadge,
} from '@/lib/entitlements';

describe('mapPlanToTier', () => {
  it('maps known plan names', () => {
    expect(mapPlanToTier('starter')).toBe('starter');
    expect(mapPlanToTier('pro')).toBe('pro');
    expect(mapPlanToTier('enterprise')).toBe('enterprise');
  });
  it('defaults unknown / empty plans to free', () => {
    expect(mapPlanToTier(null)).toBe('free');
    expect(mapPlanToTier(undefined)).toBe('free');
    expect(mapPlanToTier('bogus')).toBe('free');
  });
});

describe('tierFromSubscription', () => {
  it('entitles only active or trialing subscriptions', () => {
    expect(tierFromSubscription({ plan: 'pro', status: 'active' })).toBe('pro');
    expect(tierFromSubscription({ plan: 'starter', status: 'trialing' })).toBe('starter');
  });
  it('treats inactive statuses as free', () => {
    expect(tierFromSubscription({ plan: 'pro', status: 'past_due' })).toBe('free');
    expect(tierFromSubscription({ plan: 'pro', status: 'canceled' })).toBe('free');
    expect(tierFromSubscription({ plan: 'pro', status: null })).toBe('free');
    expect(tierFromSubscription(null)).toBe('free');
  });
});

describe('parseTier', () => {
  it('accepts exactly the known tiers', () => {
    expect(parseTier('free')).toBe('free');
    expect(parseTier('starter')).toBe('starter');
    expect(parseTier('pro')).toBe('pro');
    expect(parseTier('enterprise')).toBe('enterprise');
  });
  it('returns null for anything else, rather than rounding down to free', () => {
    // Callers decide what an unknown tier means; silently calling it `free`
    // would hand a paid account the free-tier experience.
    expect(parseTier('bogus')).toBeNull();
    // Inherited object keys are not tiers. `'toString' in TIER_RANK` is true.
    expect(parseTier('toString')).toBeNull();
    expect(parseTier('constructor')).toBeNull();
    expect(parseTier('Pro')).toBeNull();
    expect(parseTier(' pro')).toBeNull();
    expect(parseTier('')).toBeNull();
    expect(parseTier(null)).toBeNull();
    expect(parseTier(undefined)).toBeNull();
  });
});

describe('gating helpers', () => {
  it('hasApiAccess is starter and above', () => {
    expect(hasApiAccess('free')).toBe(false);
    expect(hasApiAccess('starter')).toBe(true);
    expect(hasApiAccess('pro')).toBe(true);
    expect(hasApiAccess('enterprise')).toBe(true);
  });
  it('hasAdFree is every paid tier', () => {
    expect(hasAdFree('free')).toBe(false);
    expect(hasAdFree('starter')).toBe(true);
    expect(hasAdFree('pro')).toBe(true);
    expect(hasAdFree('enterprise')).toBe(true);
  });
  it('hasBadge is pro and above', () => {
    expect(hasBadge('free')).toBe(false);
    expect(hasBadge('starter')).toBe(false);
    expect(hasBadge('pro')).toBe(true);
    expect(hasBadge('enterprise')).toBe(true);
  });
  it('ranks tiers cumulatively', () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.starter);
    expect(TIER_RANK.starter).toBeLessThan(TIER_RANK.pro);
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.enterprise);
  });
});
