import { describe, it, expect } from 'vitest';
import {
  MEMBER_FEATURES,
  featureDef,
  canUse,
  requiredTier,
  featuresFor,
  featuresLockedFor,
  upgradeHref,
  upgradeRequiredBody,
  TIER_LABELS,
  type MemberFeature,
} from '@/lib/entitlements/features';
import { isUpgradeRequired } from '@/lib/entitlements/upsell';
import { TIER_RANK, hasAdFree, hasApiAccess, hasBadge, type Tier } from '@/lib/entitlements/tiers';

const TIERS: Tier[] = ['free', 'starter', 'pro', 'enterprise'];

describe('member feature registry', () => {
  it('has a unique id per feature', () => {
    const ids = MEMBER_FEATURES.map((f) => f.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('resolves every declared id', () => {
    for (const f of MEMBER_FEATURES) expect(featureDef(f.id).id).toBe(f.id);
  });

  it('throws on an unknown id rather than silently allowing it', () => {
    // The dangerous failure would be a miss that reads as "no gate".
    expect(() => featureDef('does-not-exist' as MemberFeature)).toThrow();
  });

  it('gives every feature user-facing copy', () => {
    for (const f of MEMBER_FEATURES) {
      expect({
        id: f.id,
        ok: f.label.length > 0 && f.blurb.length > 0 && f.icon.length > 0,
      }).toEqual({
        id: f.id,
        ok: true,
      });
      // The i18n keys must be distinct or two features share a translation.
      expect(f.labelKey).not.toBe(f.blurbKey);
    }
  });

  it('uses distinct i18n keys across features', () => {
    const keys = MEMBER_FEATURES.flatMap((f) => [f.labelKey, f.blurbKey]);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('is monotonic — a higher tier never loses a feature', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const lower = featuresFor(TIERS[i - 1]).map((f) => f.id);
      const higher = featuresFor(TIERS[i]).map((f) => f.id);
      expect(lower.filter((id) => !higher.includes(id))).toEqual([]);
    }
  });

  it('splits every feature into exactly one of unlocked/locked per tier', () => {
    for (const tier of TIERS) {
      const unlocked = featuresFor(tier).map((f) => f.id);
      const locked = featuresLockedFor(tier).map((f) => f.id);
      expect(unlocked.length + locked.length).toBe(MEMBER_FEATURES.length);
      expect(unlocked.filter((id) => locked.includes(id))).toEqual([]);
    }
  });

  it('enterprise unlocks everything', () => {
    expect(featuresLockedFor('enterprise')).toEqual([]);
  });

  it('gates the features the product asked for at the right tiers', () => {
    // These are product decisions, so they are pinned rather than derived.
    expect(requiredTier('bulk-content')).toBe('pro');
    expect(requiredTier('custom-emoji')).toBe('starter');
    expect(requiredTier('sticker-packs')).toBe('starter');
    // Every paid tier is ad-free — there is no plan that sees fewer ads.
    expect(requiredTier('ad-free')).toBe('starter');
    // Free-for-everyone features: voice messages and speedruns are usable
    // without a membership, members just get more.
    expect(requiredTier('voice-messages')).toBe('free');
    expect(requiredTier('speedrun-submit')).toBe('free');
  });

  it('keeps free accounts out of the paid features', () => {
    expect(canUse('free', 'bulk-content')).toBe(false);
    expect(canUse('free', 'custom-emoji')).toBe(false);
    expect(canUse('free', 'sticker-packs')).toBe(false);
    // …but not out of the free ones.
    expect(canUse('free', 'voice-messages')).toBe(true);
    expect(canUse('free', 'speedrun-submit')).toBe(true);
  });

  it('keeps starter out of pro-only features', () => {
    expect(canUse('starter', 'custom-emoji')).toBe(true);
    expect(canUse('starter', 'bulk-content')).toBe(false);
    expect(canUse('pro', 'bulk-content')).toBe(true);
  });

  it('agrees with the pre-existing entitlement predicates', () => {
    // Two sources of truth for the same gate is exactly how a paywall drifts.
    for (const tier of TIERS) {
      expect({ tier, api: canUse(tier, 'api-access') }).toEqual({ tier, api: hasApiAccess(tier) });
      expect({ tier, badge: canUse(tier, 'profile-badge') }).toEqual({
        tier,
        badge: hasBadge(tier),
      });
      // `lib/ads/adsense.ts` gates on `hasAdFree`, and the card below advertises
      // `canUse(tier, 'ad-free')`. If those ever disagree, the membership page
      // sells an ad-free plan that still serves ads.
      expect({ tier, adFree: canUse(tier, 'ad-free') }).toEqual({ tier, adFree: hasAdFree(tier) });
    }
  });

  it('names a real tier for every minTier', () => {
    for (const f of MEMBER_FEATURES) {
      expect(TIER_RANK[f.minTier]).toBeDefined();
      expect(TIER_LABELS[f.minTier]).toBeTruthy();
    }
  });
});

describe('upgrade envelope', () => {
  it('carries everything the client needs to render an upsell', () => {
    const body = upgradeRequiredBody('bulk-content');
    expect(body).toEqual({
      error: 'upgrade_required',
      feature: 'bulk-content',
      requiredTier: 'pro',
      requiredTierLabel: TIER_LABELS.pro,
      upgradeHref: upgradeHref('bulk-content'),
    });
  });

  it('is recognised by the client narrowing helper', () => {
    expect(isUpgradeRequired(upgradeRequiredBody('custom-emoji'))).toBe(true);
  });

  it('does not mistake other error shapes for an upsell', () => {
    for (const other of [null, undefined, {}, { error: 'Forbidden' }, 'upgrade_required', 42]) {
      expect(isUpgradeRequired(other)).toBe(false);
    }
  });

  it('deep-links to the membership tab carrying the feature', () => {
    const href = upgradeHref('sticker-packs');
    expect(href).toContain('/store');
    expect(href).toContain('tab=membership');
    expect(href).toContain('feature=sticker-packs');
  });

  it('encodes the feature id safely', () => {
    for (const f of MEMBER_FEATURES) {
      const href = upgradeHref(f.id);
      expect(href).toBe(`/store?tab=membership&feature=${encodeURIComponent(f.id)}`);
    }
  });
});

describe('membership page copy', () => {
  it('has a literal t() call for every feature, and no orphans', async () => {
    // The registry carries `labelKey`/`blurbKey`, but `t(feature.labelKey)` is a
    // computed key and `i18next-parser` cannot see it — the keys never reach
    // `locales/` and every locale serves English forever. `featureCopy()` is the
    // literal-call workaround; this asserts it stays in step with the registry.
    const { featureCopy } = await import('@/components/membership/MemberFeatureGrid');
    const identity = ((_key: string, opts: { defaultValue: string }) =>
      opts.defaultValue) as unknown as Parameters<typeof featureCopy>[0];
    const copy = featureCopy(identity);

    const declared = MEMBER_FEATURES.map((f) => f.id).sort();
    const covered = Object.keys(copy).sort();
    expect(covered).toEqual(declared);

    for (const f of MEMBER_FEATURES) {
      expect({ id: f.id, ok: copy[f.id].label.length > 0 && copy[f.id].blurb.length > 0 }).toEqual({
        id: f.id,
        ok: true,
      });
    }
  });

  it('every feature key is present in the English catalog', async () => {
    // Proves the extraction actually happened, rather than trusting that it did.
    const feed = (await import('../../locales/en/feed.json')).default as Record<string, string>;
    const missing = MEMBER_FEATURES.flatMap((f) =>
      [f.labelKey, f.blurbKey].filter((k) => !(k in feed)),
    );
    expect(missing).toEqual([]);
  });
});
