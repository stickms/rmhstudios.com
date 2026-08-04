import { describe, it, expect } from 'vitest';
import {
  adsAllowed,
  adsPersonalized,
  isAdExcludedPath,
  parseSlotMap,
  AD_PLACEMENTS,
  type AdGateInput,
} from '@/lib/ads/adsense';

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
