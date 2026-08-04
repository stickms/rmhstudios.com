/**
 * Client-side half of the membership gate.
 *
 * The server refuses with a 402 and an upgrade envelope
 * (`lib/entitlements/features.ts`). This turns that envelope into something the
 * user can act on, and gives the UI a way to check *before* refusing so a
 * member-only control can present itself as an upgrade rather than as a button
 * that fails.
 *
 * Two entry points, and the difference matters:
 *
 *   - `isUpgradeRequired(res)` — for a request that already failed. Always
 *     honour this, because it is the server's answer and the only one that
 *     counts.
 *   - `useFeature(feature)` — for rendering. Optimistic and client-side only;
 *     never treat it as authorisation.
 */

import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  canUse,
  featureDef,
  upgradeHref,
  TIER_LABELS,
  type MemberFeature,
  type UpgradeRequiredBody,
} from '@/lib/entitlements/features';
import type { Tier } from '@/lib/entitlements/tiers';

/** Narrow an arbitrary failed-response body to the upgrade envelope. */
export function isUpgradeRequired(body: unknown): body is UpgradeRequiredBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === 'upgrade_required'
  );
}

/**
 * Read a `fetch` Response and, if it is a 402 upgrade refusal, return the
 * envelope. Returns null for anything else so callers can fall through to
 * their normal error handling.
 */
export async function upgradeEnvelopeFrom(res: Response): Promise<UpgradeRequiredBody | null> {
  if (res.status !== 402) return null;
  const body = await res
    .clone()
    .json()
    .catch(() => null);
  return isUpgradeRequired(body) ? body : null;
}

/**
 * Show the standard upsell toast for a refused action.
 *
 * Deliberately a toast with an action rather than a modal: the user was in the
 * middle of doing something, and a modal that interrupts to sell is the pattern
 * people install blockers for. The action goes straight to the plan, carrying
 * the feature id so the page can highlight what they came for.
 */
export function toastUpgrade(
  envelope: Pick<UpgradeRequiredBody, 'feature' | 'requiredTierLabel' | 'upgradeHref'>,
  navigate: (href: string) => void,
  t: (key: string, opts: { defaultValue: string; [k: string]: unknown }) => string,
): void {
  const def = featureDef(envelope.feature);
  toast(
    t('upsell-title', {
      defaultValue: '{{feature}} is a {{tier}} feature',
      feature: def.label,
      tier: envelope.requiredTierLabel,
    }),
    {
      description: def.blurb,
      action: {
        label: t('upsell-cta', { defaultValue: 'See plans' }),
        onClick: () => navigate(envelope.upgradeHref),
      },
    },
  );
}

export interface FeatureState {
  /** Optimistic, client-side. Never authorisation. */
  allowed: boolean;
  requiredTierLabel: string;
  href: string;
  label: string;
  blurb: string;
  /** Show the upsell for this feature without needing a failed request. */
  promptUpgrade: () => void;
}

/**
 * Render-time feature check plus a ready-made upgrade prompt.
 *
 * Pass the viewer's tier from wherever the surface already has it (the session,
 * a loader) — this hook deliberately does not fetch, so it cannot add a request
 * to every screen that renders a gated control.
 */
export function useFeature(
  feature: MemberFeature,
  tier: Tier,
  t: (key: string, opts: { defaultValue: string; [k: string]: unknown }) => string,
): FeatureState {
  const router = useRouter();
  const def = featureDef(feature);
  const href = upgradeHref(feature);
  const requiredTierLabel = TIER_LABELS[def.minTier];

  const promptUpgrade = useCallback(() => {
    toastUpgrade(
      { feature, requiredTierLabel, upgradeHref: href },
      (to) => void router.navigate({ to }),
      t,
    );
  }, [feature, requiredTierLabel, href, router, t]);

  return {
    allowed: canUse(tier, feature),
    requiredTierLabel,
    href,
    label: def.label,
    blurb: def.blurb,
    promptUpgrade,
  };
}
