/**
 * The member-feature registry: what each tier unlocks, in one place.
 *
 * Before this file, entitlement lived as a scatter of one-off predicates in
 * `lib/entitlements.ts` (`hasApiAccess`, `hasBadge`, …). That works for three
 * flags and stops working the moment features need to be *listed* — because a
 * paywall has three jobs, not one:
 *
 *   1. Decide, server-side, whether this account may do the thing.
 *   2. Explain, at the moment of refusal, what the thing costs and why.
 *   3. Enumerate everything on the membership page so it reads as a reason to
 *      subscribe rather than a price list.
 *
 * Doing (1) in a route and (2)/(3) in hand-written UI copy is how a paywall
 * ends up advertising a feature it doesn't gate, or gating one it never
 * advertised. Everything here is derived from a single declaration, and the
 * membership page renders itself from this registry — so a new gated feature
 * appears on the pricing page in the same commit that gates it, or it doesn't
 * ship.
 *
 * Client-safe: no Prisma, no `.server` imports. The API routes and the
 * upsell UI import the same table.
 */

import { TIER_RANK, type Tier } from '@/lib/entitlements/tiers';

/** Stable ids. Persisted in analytics and referenced by upsell deep links. */
export type MemberFeature =
  | 'ad-free'
  | 'voice-messages'
  | 'custom-emoji'
  | 'sticker-packs'
  | 'bulk-content'
  | 'trash-extended'
  | 'speedrun-submit'
  | 'typing-analytics'
  | 'ladder-ai-prep'
  | 'api-access'
  | 'profile-badge';

export interface FeatureDef {
  id: MemberFeature;
  /** Lowest tier that unlocks it. */
  minTier: Tier;
  /** i18n key for the short name shown on the membership page. */
  labelKey: string;
  /** English source string — also the `defaultValue` at every call site. */
  label: string;
  /** i18n key for the one-line "why you'd want this". */
  blurbKey: string;
  blurb: string;
  /** lucide icon name, resolved by the renderer. */
  icon: string;
  /** Where "Learn more" goes, when the feature has a home of its own. */
  href?: string;
}

/**
 * Ordered for the membership page: the things people actually subscribe for
 * first, plumbing last.
 */
export const MEMBER_FEATURES: readonly FeatureDef[] = [
  {
    id: 'ad-free',
    minTier: 'starter',
    labelKey: 'feature-ad-free',
    label: 'No ads',
    blurbKey: 'feature-ad-free-blurb',
    blurb:
      'Free accounts are paid for by ads. A membership removes them everywhere — and the ad script is never even fetched, so nothing is loaded to be blocked.',
    icon: 'EyeOff',
  },
  {
    id: 'custom-emoji',
    minTier: 'starter',
    labelKey: 'feature-custom-emoji',
    label: 'Custom emoji',
    blurbKey: 'feature-custom-emoji-blurb',
    blurb:
      'Upload your own emoji and use them anywhere on the site — posts, comments, messages and reactions.',
    icon: 'Smile',
  },
  {
    id: 'sticker-packs',
    minTier: 'starter',
    labelKey: 'feature-sticker-packs',
    label: 'Sticker & emoji packs',
    blurbKey: 'feature-sticker-packs-blurb',
    blurb:
      'Build packs of your own stickers and emoji and publish them. Anyone can subscribe to your packs and use them — free accounts included.',
    icon: 'Sticker',
  },
  {
    id: 'voice-messages',
    minTier: 'free',
    labelKey: 'feature-voice-messages',
    label: 'Longer voice messages',
    blurbKey: 'feature-voice-messages-blurb',
    blurb:
      'Everyone gets voice messages. Members get longer ones at better quality — up to 10 minutes.',
    icon: 'Mic',
  },
  {
    id: 'bulk-content',
    minTier: 'pro',
    labelKey: 'feature-bulk-content',
    label: 'Bulk content tools',
    blurbKey: 'feature-bulk-content-blurb',
    blurb:
      'Clean up thousands of posts, follows or bookmarks in one pass, with a preview before anything happens.',
    icon: 'ListChecks',
  },
  {
    id: 'trash-extended',
    minTier: 'starter',
    labelKey: 'feature-trash-extended',
    label: 'Longer recovery window',
    blurbKey: 'feature-trash-extended-blurb',
    blurb:
      'Deleted posts are recoverable for 30 days on a free account, and 90 days with a membership.',
    icon: 'Undo2',
  },
  {
    id: 'typing-analytics',
    minTier: 'starter',
    labelKey: 'feature-typing-analytics',
    label: 'RMHType analytics',
    blurbKey: 'feature-typing-analytics-blurb',
    blurb:
      'A per-key heatmap of your speed and accuracy, and practice runs generated from your own worst keys.',
    icon: 'Keyboard',
  },
  {
    id: 'ladder-ai-prep',
    minTier: 'starter',
    labelKey: 'feature-ladder-ai-prep',
    label: 'Interview prep',
    blurbKey: 'feature-ladder-ai-prep-blurb',
    blurb:
      'Turn any tracked application into a prep sheet: likely questions, your own stories matched to the posting.',
    icon: 'BriefcaseBusiness',
  },
  {
    id: 'speedrun-submit',
    minTier: 'free',
    labelKey: 'feature-speedrun-submit',
    label: 'Speedrun leaderboards',
    blurbKey: 'feature-speedrun-submit-blurb',
    blurb: 'Submit verified runs to per-category leaderboards. Free for everyone.',
    icon: 'Timer',
  },
  {
    id: 'api-access',
    minTier: 'starter',
    labelKey: 'feature-api-access',
    label: 'Developer API',
    blurbKey: 'feature-api-access-blurb',
    blurb: 'Programmatic access to the platform, with webhooks and image upload.',
    icon: 'Code',
  },
  {
    id: 'profile-badge',
    minTier: 'pro',
    labelKey: 'feature-profile-badge',
    label: 'Profile badge',
    blurbKey: 'feature-profile-badge-blurb',
    blurb: 'A badge on your profile and beside your name.',
    icon: 'BadgeCheck',
  },
];

const BY_ID = new Map(MEMBER_FEATURES.map((f) => [f.id, f]));

export function featureDef(id: MemberFeature): FeatureDef {
  const def = BY_ID.get(id);
  // Every id in the union has an entry; a miss means the table and the type
  // drifted, which the test file forbids.
  if (!def) throw new Error(`Unknown member feature: ${id}`);
  return def;
}

/** The single question every gated route asks. */
export function canUse(tier: Tier, feature: MemberFeature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[featureDef(feature).minTier];
}

/** The tier a user must reach to unlock this — for the upsell copy. */
export function requiredTier(feature: MemberFeature): Tier {
  return featureDef(feature).minTier;
}

/** Features a given tier unlocks, for the membership page's per-plan column. */
export function featuresFor(tier: Tier): readonly FeatureDef[] {
  return MEMBER_FEATURES.filter((f) => TIER_RANK[tier] >= TIER_RANK[f.minTier]);
}

/** Features this tier does NOT have — the "upgrade to also get" list. */
export function featuresLockedFor(tier: Tier): readonly FeatureDef[] {
  return MEMBER_FEATURES.filter((f) => TIER_RANK[tier] < TIER_RANK[f.minTier]);
}

/**
 * Deep link to the membership page, carrying which feature sent the user there
 * so the page can highlight it and so we can tell which gate actually converts.
 */
export function upgradeHref(feature: MemberFeature): string {
  return `/store?tab=membership&feature=${encodeURIComponent(feature)}`;
}

/** Display name for a tier, for upsell copy. Plan ids are not user-facing. */
export const TIER_LABELS: Record<Tier, string> = {
  free: 'Free',
  starter: 'HARD-R',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/**
 * The error body a gated API route returns on refusal. The client renders an
 * upsell from this rather than a toast saying "forbidden", which is the whole
 * point of routing refusals through one shape.
 */
export interface UpgradeRequiredBody {
  error: 'upgrade_required';
  feature: MemberFeature;
  requiredTier: Tier;
  requiredTierLabel: string;
  upgradeHref: string;
}

export function upgradeRequiredBody(feature: MemberFeature): UpgradeRequiredBody {
  const tier = requiredTier(feature);
  return {
    error: 'upgrade_required',
    feature,
    requiredTier: tier,
    requiredTierLabel: TIER_LABELS[tier],
    upgradeHref: upgradeHref(feature),
  };
}
