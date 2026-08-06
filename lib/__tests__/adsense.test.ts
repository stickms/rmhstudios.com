import { describe, it, expect } from 'vitest';
import {
  adsAllowed,
  adsPersonalized,
  isAdExcludedPath,
  isAdFreeTier,
  parseSlotMap,
  AD_PLACEMENTS,
  type AdGateInput,
} from '@/lib/ads/adsense';
import { canUse } from '@/lib/entitlements/features';
import { hasAdFree, type Tier } from '@/lib/entitlements/tiers';

/**
 * The ad gate is the one piece of the AdSense integration whose bugs are
 * invisible in review and expensive in production: every failure mode is
 * "an ad quietly appeared somewhere it must not", which nobody sees until a
 * paying member or a regulator does. So it is a pure function, and this is
 * where it's pinned down.
 */

const base: AdGateInput = {
  clientId: 'ca-pub-0000000000000000',
  pathname: '/library',
  tier: 'free',
  sessionResolved: true,
  consent: 'all',
};

describe('adsAllowed', () => {
  it('allows a consenting free user on an ordinary page', () => {
    expect(adsAllowed(base)).toBe(true);
  });

  it('is off entirely when no publisher id is configured', () => {
    expect(adsAllowed({ ...base, clientId: '' })).toBe(false);
  });

  it('is off until the cookie banner has been answered', () => {
    expect(adsAllowed({ ...base, consent: null })).toBe(false);
  });

  it('still serves ads on "essential only" — but non-personalised ones', () => {
    expect(adsAllowed({ ...base, consent: 'essential' })).toBe(true);
    expect(adsPersonalized('essential')).toBe(false);
    expect(adsPersonalized('all')).toBe(true);
    expect(adsPersonalized(null)).toBe(false);
  });

  it.each(['starter', 'pro', 'enterprise'])('is off for the %s membership tier', (tier) => {
    expect(adsAllowed({ ...base, tier })).toBe(false);
  });

  it('is on for signed-out visitors and the free tier', () => {
    expect(adsAllowed({ ...base, tier: null })).toBe(true);
    expect(adsAllowed({ ...base, tier: undefined })).toBe(true);
    expect(adsAllowed({ ...base, tier: 'free' })).toBe(true);
  });

  it('is off while the session — and so the tier — is still unknown', () => {
    // The window this closes: the session resolves after the first client
    // render, so for a moment a member looks exactly like a signed-out visitor.
    // Rounding that down to "free" requests an ad on a paying member's behalf,
    // and the request is not recallable once fired.
    expect(adsAllowed({ ...base, sessionResolved: false })).toBe(false);
    expect(adsAllowed({ ...base, tier: null, sessionResolved: false })).toBe(false);
    expect(adsAllowed({ ...base, tier: 'free', sessionResolved: false })).toBe(false);
  });

  it('is off for a tier string it does not recognise', () => {
    // A renamed plan id or a stale persisted session snapshot lands here. It is
    // not evidence of a free account, and guessing wrong bills a paying member
    // in ads — so an unknown value costs an impression instead.
    expect(adsAllowed({ ...base, tier: 'hard-r' })).toBe(false);
    expect(adsAllowed({ ...base, tier: 'legacy-supporter' })).toBe(false);
  });

  it('is off inside a Discord Activity iframe', () => {
    expect(adsAllowed({ ...base, discordActivity: true })).toBe(false);
  });

  it.each([
    '/login',
    '/settings',
    '/settings/appearance',
    '/wallet',
    '/checkout/starter',
    '/messages/abc123',
    '/discord/rmhbox',
    '/embed/post/1',
    '/offline',
    '/secret/thing',
    '/api/og/post/1',
  ])('is off on %s', (pathname) => {
    expect(adsAllowed({ ...base, pathname })).toBe(false);
  });

  it('does not exclude a path that merely starts with the same letters', () => {
    // `/logins` and `/settings-guide` are not `/login` and `/settings` — prefix
    // matching has to be segment-aware or an unrelated page loses its ads (or,
    // worse, a future `/wallet-something` silently keeps them by accident).
    expect(isAdExcludedPath('/logins')).toBe(false);
    expect(isAdExcludedPath('/settings-guide')).toBe(false);
    expect(isAdExcludedPath('/settings')).toBe(true);
    expect(isAdExcludedPath('/settings/')).toBe(true);
  });
});

describe('isAdFreeTier', () => {
  const TIERS: Tier[] = ['free', 'starter', 'pro', 'enterprise'];

  it('is the entitlement registry, not a second opinion about it', () => {
    // Two independent lists of "which tiers are paid" is how the membership
    // page ends up advertising an ad-free plan that still serves ads. The gate
    // must agree with both the predicate and the feature card, for every tier.
    for (const tier of TIERS) {
      expect({ tier, adFree: isAdFreeTier(tier) }).toEqual({ tier, adFree: hasAdFree(tier) });
      expect({ tier, adFree: isAdFreeTier(tier) }).toEqual({
        tier,
        adFree: canUse(tier, 'ad-free'),
      });
    }
  });

  it('treats an absent tier as a signed-out visitor, who does see ads', () => {
    expect(isAdFreeTier(null)).toBe(false);
    expect(isAdFreeTier(undefined)).toBe(false);
    expect(isAdFreeTier('')).toBe(false);
  });

  it('fails closed on a tier it cannot parse', () => {
    expect(isAdFreeTier('pro ')).toBe(true);
    expect(isAdFreeTier('Pro')).toBe(true);
    expect(isAdFreeTier('whatever-comes-next')).toBe(true);
  });

  it('covers a future paid tier without being told about it', () => {
    // `hasAdFree` is a rank comparison, so anything ranked at or above starter
    // is ad-free the day it is added. A hardcoded set of names would not be,
    // and the failure would be silent.
    for (const tier of TIERS) {
      expect({ tier, adFree: isAdFreeTier(tier) }).toEqual({ tier, adFree: tier !== 'free' });
    }
  });
});

describe('parseSlotMap', () => {
  it('reads a comma-separated placement map', () => {
    expect(parseSlotMap('article-end=1234567890,rail=2345678901')).toEqual({
      'article-end': '1234567890',
      rail: '2345678901',
    });
  });

  it('tolerates whitespace and an empty value', () => {
    expect(parseSlotMap(' article-end = 111 , rail= ')).toEqual({ 'article-end': '111' });
  });

  it('ignores unknown placements and malformed entries rather than throwing', () => {
    // A typo in a deploy variable must cost one unrendered slot, not the page.
    expect(parseSlotMap('nope=1,garbage,article-end=222')).toEqual({ 'article-end': '222' });
  });

  it('is empty for an unset variable', () => {
    expect(parseSlotMap(undefined)).toEqual({});
    expect(parseSlotMap('')).toEqual({});
  });
});

describe('AD_PLACEMENTS', () => {
  it('reserves a height for every placement, so a filled unit shifts nothing', () => {
    for (const [name, config] of Object.entries(AD_PLACEMENTS)) {
      expect(config.minHeight, `${name} must reserve space`).toBeGreaterThan(0);
    }
  });
});
