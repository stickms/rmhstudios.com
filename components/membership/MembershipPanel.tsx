/**
 * Membership panel: the subscription tiers and what they unlock, as the Membership tab of /store.
 *
 * Anatomy (Steel): no hero. The plans are four columns divided by vertical rules where the column
 * is wide enough and a stack divided by horizontal rules on a phone; each is a name, a price, one
 * line, its features as rows on rules, and its action. Exactly one action on the tab is the ink
 * primary (R4): Subscribe on the recommended plan while the viewer is below it, otherwise Manage
 * billing. A plan the viewer already has says so in words instead of showing a disabled button.
 * Under the plans, every gated feature is a row on a rule (`MemberFeatureGrid`).
 *
 * HARD-R and Pro start Stripe-hosted checkout through the better-auth stripe client; Enterprise is
 * a mail link. Nothing here changes a price, a plan or what Stripe is asked for.
 *
 * Note on tier ids: the $20 tier is DISPLAYED as "HARD-R" but its id is still `starter` everywhere
 * under the hood. That string is the Stripe plan name, the `Subscription.plan` column value and
 * the gift/grant API enum, so it is deliberately not renamed with the label.
 *
 * `returnPath` controls where Stripe sends the viewer back to (and where the status line is read
 * from).
 */
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { Tier } from '@/lib/entitlements';
import { useMembershipActions } from '@/components/membership/useMembershipActions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { MemberFeatureGrid } from '@/components/membership/MemberFeatureGrid';
import { TIER_RANK as RANK } from '@/lib/entitlements/tiers';
import type { MemberFeature } from '@/lib/entitlements/features';

// `TIER_RANK` used to be re-declared here with a note not to import the shared
// one "because it pulls the prisma client into the client bundle". That is no
// longer true: the pure tier vocabulary lives in `lib/entitlements/tiers.ts`,
// which has no server imports, and `lib/entitlements.ts` re-exports it.

/**
 * Structure only — the words live in `planCopy()` below. Prices stay literal:
 * a currency amount is not a translatable string, but the period suffix
 * ("/mo") is.
 */
export type Plan = {
  tier: Tier;
  price: string;
  cta: 'current' | 'subscribe' | 'contact';
  featured?: boolean;
};

export const PLANS: Plan[] = [
  { tier: 'free', price: '$0', cta: 'current' },
  { tier: 'starter', price: '$20', cta: 'subscribe' },
  { tier: 'pro', price: '$100', cta: 'subscribe', featured: true },
  { tier: 'enterprise', price: 'Custom', cta: 'contact' },
];

/**
 * Plan copy, per tier.
 *
 * Names, taglines and feature bullets used to be literal English in the `PLANS`
 * table and rendered raw, so every locale got English (§10 — every user-facing
 * string goes through `t()`). Every key here is spelled out literally rather
 * than built from the tier id: `pnpm i18n:extract` parses the source
 * statically, so a computed key like `plan-${tier}-name` is invisible to it and
 * would never reach a translator.
 */
export function planCopy(t: (key: string, opts: { defaultValue: string }) => string) {
  return {
    free: {
      name: t('plan-free-name', { defaultValue: 'Free' }),
      period: t('plan-free-period', { defaultValue: '/forever' }),
      tagline: t('plan-free-tagline', { defaultValue: 'A feel for the studio.' }),
      features: [
        t('plan-free-feature-1', { defaultValue: 'Community feed & profiles' }),
        t('plan-free-feature-2', { defaultValue: 'Public Pages, Builds & Library' }),
        t('plan-free-feature-3', { defaultValue: 'Standard support' }),
      ],
    },
    starter: {
      name: t('plan-starter-name', { defaultValue: 'HARD-R' }),
      period: t('plan-starter-period', { defaultValue: '/mo' }),
      tagline: t('plan-starter-tagline', {
        defaultValue: 'Everything unlocked — and the keys.',
      }),
      features: [
        t('plan-starter-feature-1', { defaultValue: 'Everything in Free' }),
        t('plan-starter-feature-2', { defaultValue: 'All premium features' }),
        t('plan-starter-feature-3', { defaultValue: 'RMH API access' }),
        t('plan-starter-feature-4', { defaultValue: 'Priority support' }),
      ],
    },
    pro: {
      name: t('plan-pro-name', { defaultValue: 'Pro' }),
      period: t('plan-pro-period', { defaultValue: '/mo' }),
      tagline: t('plan-pro-tagline', { defaultValue: 'For power users who want the badge.' }),
      features: [
        t('plan-pro-feature-1', { defaultValue: 'Everything in HARD-R' }),
        t('plan-pro-feature-2', { defaultValue: 'Verified profile badge' }),
        t('plan-pro-feature-3', { defaultValue: 'Early access to new tools' }),
        t('plan-pro-feature-4', { defaultValue: 'Dedicated support' }),
      ],
    },
    enterprise: {
      name: t('plan-enterprise-name', { defaultValue: 'Enterprise' }),
      period: '',
      tagline: t('plan-enterprise-tagline', {
        defaultValue: 'Pro, scaled to your whole company.',
      }),
      features: [
        t('plan-enterprise-feature-1', { defaultValue: 'Everything in Pro' }),
        t('plan-enterprise-feature-2', { defaultValue: 'Seats for your team' }),
        t('plan-enterprise-feature-3', { defaultValue: 'Custom contract & invoicing' }),
        t('plan-enterprise-feature-4', { defaultValue: 'SLA & onboarding' }),
      ],
    },
  } satisfies Record<Tier, { name: string; period: string; tagline: string; features: string[] }>;
}

export function MembershipPanel({
  currentTier,
  returnPath = '/store',
  highlightFeature = null,
}: {
  /** `null` = signed out. Distinct from 'free', which is a real membership. */
  currentTier: Tier | null;
  returnPath?: string;
  /**
   * The feature that sent the viewer here, from `?feature=` (see `upgradeHref`).
   * Its row sorts first and is marked, so someone refused mid-action lands
   * looking at the thing they wanted rather than at a price table.
   */
  highlightFeature?: MemberFeature | null;
}) {
  const { t } = useTranslation('site');
  const signedOut = currentTier === null;
  const tier: Tier = currentTier ?? 'free';
  const { busy, status, setStatus, subscribe, manageBilling } = useMembershipActions(returnPath);
  const COPY = planCopy(t);
  // The one primary: the recommended plan while the viewer is below it, else the billing portal.
  const recommended = PLANS.find((p) => p.featured && p.cta === 'subscribe');
  const primaryTier = recommended && RANK[tier] < RANK[recommended.tier] ? recommended.tier : null;
  const paid = !signedOut && tier !== 'free';

  return (
    <section className="flex flex-col gap-8 pt-4">
      {status ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-y border-site-border py-2"
        >
          <p className="t-body flex items-center gap-2 text-site-text">
            {status === 'success' ? (
              <Check className="size-4 shrink-0 text-site-success" aria-hidden />
            ) : null}
            {status === 'success'
              ? t('membership-status-success', {
                  defaultValue: 'Payment received. Your membership is being activated.',
                })
              : t('status-cancelled', {
                  defaultValue: 'Checkout cancelled. No charge was made.',
                })}
          </p>
          <IconButton
            icon={X}
            variant="ghost"
            label={t('status-dismiss', { defaultValue: 'Dismiss' })}
            onClick={() => setStatus(null)}
          />
        </div>
      ) : null}

      {paid ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="t-body text-site-text">
            {t('membership-current-line', {
              plan: COPY[tier].name,
              defaultValue: 'You are on {{plan}}.',
            })}
          </p>
          <Button
            type="button"
            variant={primaryTier ? 'default' : 'primary'}
            onClick={manageBilling}
            loading={busy === 'portal'}
            disabled={busy !== null}
          >
            {t('manage-billing', { defaultValue: 'Manage billing' })}
          </Button>
        </div>
      ) : null}

      {/* Sized off the CONTAINER, not the viewport: four columns only where each gets about
          180px, otherwise one stack. */}
      <div className="@container">
        <div className="grid @3xl:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = !signedOut && tier === plan.tier;
            const owned = !signedOut && RANK[tier] > RANK[plan.tier];
            const copy = COPY[plan.tier];
            const isPrimary = primaryTier === plan.tier;
            return (
              <article
                key={plan.tier}
                data-slot="plan"
                className="flex min-w-0 flex-col gap-4 border-t border-site-border py-5 @3xl:border-s @3xl:border-t-0 @3xl:px-5 @3xl:py-0 @3xl:first:border-s-0 @3xl:first:ps-0 @3xl:last:pe-0"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex min-h-6 flex-wrap items-center gap-2">
                    <h2 className="t-heading">{copy.name}</h2>
                    {isCurrent ? (
                      <Badge variant="solid">
                        {t('current-badge', { defaultValue: 'Current' })}
                      </Badge>
                    ) : plan.featured ? (
                      <Badge>{t('most-popular', { defaultValue: 'Most popular' })}</Badge>
                    ) : null}
                  </div>
                  <p className="flex flex-wrap items-baseline gap-x-1">
                    <span className="t-heading tabular-nums">{plan.price}</span>
                    {copy.period ? <span className="t-meta">{copy.period}</span> : null}
                  </p>
                  <p className="t-body text-site-text-muted @3xl:min-h-[2.9em]">{copy.tagline}</p>
                </div>

                <ul className="flex-1 border-t border-site-border">
                  {copy.features.map((f) => (
                    <li
                      key={f}
                      className="t-body flex items-start gap-2 border-b border-site-border py-2 text-site-text"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-site-text-muted" aria-hidden />
                      <span className="min-w-0">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex min-h-9 items-center pointer-coarse:min-h-11">
                  {isCurrent || owned || (plan.cta === 'current' && !signedOut) ? (
                    <p className="t-body text-site-text-muted">
                      {isCurrent
                        ? t('your-current-plan', { defaultValue: 'Your current plan' })
                        : owned
                          ? t('plan-included', { defaultValue: 'Included in your plan' })
                          : t('free-forever', { defaultValue: 'Free forever' })}
                    </p>
                  ) : plan.cta === 'current' ? (
                    <Button asChild variant="default" className="w-full">
                      <a href="/login">
                        {t('plan-create-account', { defaultValue: 'Create an account' })}
                      </a>
                    </Button>
                  ) : plan.cta === 'subscribe' ? (
                    <Button
                      type="button"
                      onClick={() => subscribe(plan.tier as 'starter' | 'pro')}
                      loading={busy === plan.tier}
                      disabled={busy !== null}
                      variant={isPrimary ? 'primary' : 'default'}
                      className="w-full"
                    >
                      {paid
                        ? t('upgrade', { defaultValue: 'Upgrade' })
                        : t('subscribe', { defaultValue: 'Subscribe' })}
                    </Button>
                  ) : (
                    <Button asChild variant="default" className="w-full">
                      <a href="mailto:team@rmhstudios.com?subject=Enterprise%20plan">
                        {t('contact-team', { defaultValue: 'Contact team' })}
                      </a>
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="t-meta mt-4">
          {t('billing-footnote', {
            defaultValue: 'Billed monthly · cancel anytime · secure checkout by Stripe',
          })}
        </p>
      </div>

      {/* Rendered from the same registry the API routes gate on, so this list cannot drift from
          what is actually enforced. */}
      <MemberFeatureGrid tier={tier} highlight={highlightFeature ?? null} signedOut={signedOut} />
    </section>
  );
}
