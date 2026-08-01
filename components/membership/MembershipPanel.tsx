/**
 * Membership panel — the editorial subscription-tier UI.
 *
 * Extracted from the former standalone /pricing route so it can be embedded
 * both there and at the top of the combined /store page. Starter & Pro start
 * Stripe-hosted checkout via the better-auth stripe client; Enterprise is a
 * sales-led "Contact team" flow. The Pro tier is visually featured (gold
 * accents echo the amber profile badge it unlocks).
 *
 * Self-contained (atmosphere + scoped styles live inside the section), so it
 * drops into any positioned container. `returnPath` controls where Stripe
 * sends the viewer back to (and where the status banner is read from).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, ArrowUpRight, ArrowRight, X } from 'lucide-react';
import type { Tier } from '@/lib/entitlements';
import { authClient } from '@/lib/auth-client';
import { PinnedHero } from '@/components/feed/PinnedHero';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Local display-only ordering (do NOT import the server-side TIER_RANK — it
// pulls the prisma client into the client bundle).
const RANK: Record<Tier, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

/**
 * Structure only — the words live in `planCopy()` below. Prices stay literal:
 * a currency amount is not a translatable string, but the period suffix
 * ("/mo") is.
 */
type Plan = {
  tier: Tier;
  price: string;
  cta: 'current' | 'subscribe' | 'contact';
  featured?: boolean;
};

const PLANS: Plan[] = [
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
function planCopy(t: (key: string, opts: { defaultValue: string }) => string) {
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
      name: t('plan-starter-name', { defaultValue: 'Starter' }),
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
        t('plan-pro-feature-1', { defaultValue: 'Everything in Starter' }),
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
  returnPath = '/pricing',
  onCoinShop,
  headingLevel = 'h1',
}: {
  /** `null` = signed out. Distinct from 'free', which is a real membership. */
  currentTier: Tier | null;
  returnPath?: string;
  /** When set, shows a ghost button in the hero that opens the RMH Coins shop
   *  (on /store, the sibling "Shop" tab). Omit it where there is no shop to
   *  send the visitor to — /pricing renders this panel standalone. */
  onCoinShop?: () => void;
  /** Pass 'h2' when the embedding page already renders its own h1 (/store). */
  headingLevel?: 'h1' | 'h2';
}) {
  const { t } = useTranslation('site');
  const signedOut = currentTier === null;
  const tier: Tier = currentTier ?? 'free';
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<'success' | 'cancelled' | null>(null);
  const COPY = planCopy(t);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('status');
    if (p === 'success' || p === 'cancelled') setStatus(p);
  }, []);

  async function subscribe(plan: 'starter' | 'pro') {
    setBusy(plan);
    try {
      const result = await authClient.subscription.upgrade({
        plan,
        successUrl: `${returnPath}?status=success`,
        cancelUrl: `${returnPath}?status=cancelled`,
      });
      if (result?.error) {
        console.error('subscribe failed:', result.error);
        return;
      }
      if (result?.data?.url && !result.data.redirect) {
        window.location.href = result.data.url;
      }
    } catch (err) {
      console.error('subscribe failed:', err);
    } finally {
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy('portal');
    try {
      const result = await authClient.subscription.billingPortal({ returnUrl: returnPath });
      if (result?.error) {
        console.error('manageBilling failed:', result.error);
        return;
      }
      if (result?.data?.url && !result.data.redirect) {
        window.location.href = result.data.url;
      }
    } catch (err) {
      console.error('manageBilling failed:', err);
    } finally {
      setBusy(null);
    }
  }

  return (
    // No `overflow-hidden` on this section: it would establish a scroll
    // container and break the pinned hero's position:sticky. The hero clips
    // its own glow internally.
    <section className="relative isolate">
      <PricingStyles />

      {/* ── Signature pinned hero ────────────────────────────── */}
      <PinnedHero
        as={headingLevel}
        eyebrow={t('membership-title', { defaultValue: 'Membership' })}
        title={
          <>
            {t('hero-heading-line1', { defaultValue: 'Choose your' })} <br />
            <span className="text-site-accent">
              {t('hero-heading-line2', { defaultValue: 'altitude.' })}
            </span>
          </>
        }
        subtitle={t('hero-subheading', {
          defaultValue:
            'Four tiers, one studio. Unlock the full toolset, the RMH API, and a verified badge — or scale the whole thing to your company.',
        })}
        scrollCue={t('scroll-to-compare', { defaultValue: 'Compare tiers' })}
        actions={
          <>
            {!signedOut && tier !== 'free' && (
              <button
                type="button"
                onClick={manageBilling}
                disabled={busy === 'portal'}
                className="inline-flex items-center gap-2 rounded-full border border-site-border bg-site-surface px-5 py-2.5 text-sm font-semibold text-site-text transition-colors hover:bg-site-surface-hover disabled:opacity-50"
              >
                {busy === 'portal' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                {t('manage-billing', { defaultValue: 'Manage billing' })}
              </button>
            )}
            {onCoinShop && (
              <button
                type="button"
                onClick={onCoinShop}
                className="group inline-flex items-center gap-2 rounded-full border border-site-border bg-site-surface/40 px-5 py-2.5 text-sm font-semibold text-site-text transition-colors hover:bg-site-surface-hover"
              >
                {t('coins-shop-jump', { defaultValue: 'RMH Coins shop' })}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </>
        }
      />

      {/* Content padding only — the center-column width is governed by the
          surrounding AnimatedMain so the gutters match blog/library. The old
          section divider is gone (§8.4): the plans float over the aurora. */}
      <div className="relative px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        {/* ── Status banner ──────────────────────────────────── */}
        {status && (
          <Reveal
            className={`mb-10 flex items-center justify-between gap-3 rounded-site border px-5 py-3.5 text-sm ${
              status === 'success'
                ? 'border-[color:var(--site-success)]/30 bg-[color:var(--site-success)]/10 text-[color:var(--site-success)]'
                : 'border-site-border bg-site-surface text-site-text-muted'
            }`}
          >
            <span>
              {status === 'success'
                ? t('status-success', {
                    defaultValue: 'Welcome aboard — your membership is being activated.',
                  })
                : t('status-cancelled', {
                    defaultValue: 'Checkout cancelled. No charge was made.',
                  })}
            </span>
            <button
              type="button"
              onClick={() => setStatus(null)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </Reveal>
        )}

        {/* ── Plan grid ──────────────────────────────────────────
            Sized off the CONTAINER, not the viewport. This panel renders inside
            the site's centre column, which stays ~640px however wide the screen
            gets, so the old `xl:grid-cols-4` viewport breakpoint put four cards
            in 640px — 148px each, which wrapped every tagline into three ragged
            lines and pushed "Custom" and the CTA labels past their own borders.
            Container queries make the card count answer to the space that
            actually exists: two up in the centre column, four only when a host
            genuinely has room for them. */}
        <div className="@container">
          <RevealGroup className="grid items-stretch gap-4 @md:grid-cols-2 @5xl:grid-cols-4">
            {PLANS.map((plan) => {
              const isCurrent = !signedOut && tier === plan.tier;
              const owned = !signedOut && RANK[tier] > RANK[plan.tier];
              const copy = COPY[plan.tier];
              const cta =
                RANK[tier] < RANK[plan.tier] && tier !== 'free'
                  ? t('upgrade', { defaultValue: 'Upgrade' })
                  : t('subscribe', { defaultValue: 'Subscribe' });
              return (
                <RevealItem key={plan.tier} className="flex">
                  {/* Card is a plain <article> so its CSS hover/featured
                      transforms aren't clobbered by the RevealItem motion node's
                      inline transform. */}
                  <article
                    // Floating L2 slabs (§8.4): .glass-pane owns the frost/tint/
                    // border/ring; the featured tier additionally takes the page's
                    // one prism refract slot + ambient sheen + per-element lens.
                    data-glass-lens={plan.featured ? '' : undefined}
                    className={cn(
                      'pricing-card group relative flex w-full flex-col glass-pane rounded-site p-5',
                      // Clearance for the ribbon that straddles the top edge.
                      plan.featured &&
                        'pricing-card--featured glass-refract glass-refract--prism glass-liquid pt-7',
                    )}
                  >
                    {plan.featured && (
                      <span className="pricing-ribbon">
                        {t('most-popular', { defaultValue: 'Most popular' })}
                      </span>
                    )}

                    {/* Name and status sit in ONE flow row. The "Current" chip
                        used to be absolutely positioned over the top-right
                        corner, where it landed on top of the tier name. */}
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={cn(
                          'font-display text-2xl font-bold leading-tight tracking-tight',
                          plan.featured ? 'text-site-warning' : 'text-site-text',
                        )}
                      >
                        {copy.name}
                      </h3>
                      {isCurrent && (
                        <Badge
                          variant="accent"
                          size="sm"
                          className="mt-1 font-mono uppercase tracking-widest"
                        >
                          {t('current-badge', { defaultValue: 'Current' })}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1.5 min-h-10 text-sm leading-snug text-site-text-muted">
                      {copy.tagline}
                    </p>

                    {/* `flex-wrap` + `break-words`: a long localised price or a
                        word like "Custom" now wraps inside the card instead of
                        running out through its right border. */}
                    <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="font-mono text-3xl font-semibold tracking-tight text-site-text tabular-nums break-words">
                        {plan.price}
                      </span>
                      {copy.period && (
                        <span className="font-mono text-xs text-site-text-muted">
                          {copy.period}
                        </span>
                      )}
                    </p>

                    <div className="my-5 h-px w-full bg-gradient-to-r from-site-border to-transparent" />

                    <ul className="flex flex-1 flex-col gap-2.5">
                      {copy.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-site-text">
                          {/* Token utilities — this was an inline `style` with a
                              hand-written color-mix, invisible to the themes. */}
                          <span
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                              plan.featured ? 'bg-site-warning/20' : 'bg-site-accent-dim',
                            )}
                          >
                            <Check
                              className={cn(
                                'h-2.5 w-2.5',
                                plan.featured ? 'text-site-warning' : 'text-site-accent',
                              )}
                              aria-hidden
                            />
                          </span>
                          <span className="leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTAs are the shared `Button` primitive (§5.2) rather than
                        three hand-rolled pills with inline background styles.
                        `h-auto min-h-11` + `whitespace-normal` override the
                        primitive's fixed height and nowrap so a two-word label —
                        or a longer translation of one — grows the button instead
                        of spilling over its own border. */}
                    <div className="mt-6">
                      {/* A tier you already hold has nothing to click, so it gets
                          the quiet dashed status pill rather than a disabled
                          fill. A greyed-out `bg-site-accent` button reads as a
                          heavy slab that still looks pressable, and it competed
                          with the one real call to action on the page. */}
                      {isCurrent || owned || (plan.cta === 'current' && !signedOut) ? (
                        <p className="flex min-h-11 items-center justify-center rounded-[var(--site-control-radius)] border border-dashed border-site-border px-3 py-2.5 text-center text-sm font-medium text-site-text-muted">
                          {isCurrent
                            ? t('your-current-plan', { defaultValue: 'Your current plan' })
                            : owned
                              ? t('included', { defaultValue: 'Included' })
                              : t('free-forever', { defaultValue: 'Free forever' })}
                        </p>
                      ) : plan.cta === 'current' ? (
                        <Button
                          asChild
                          variant="accent"
                          className="h-auto min-h-11 w-full whitespace-normal py-2.5 text-center"
                        >
                          <a href="/login">
                            {t('get-started-free', { defaultValue: 'Get started — free' })}
                            <ArrowUpRight aria-hidden />
                          </a>
                        </Button>
                      ) : plan.cta === 'subscribe' ? (
                        <Button
                          type="button"
                          onClick={() => subscribe(plan.tier as 'starter' | 'pro')}
                          loading={busy === plan.tier}
                          // Ink tracks its surface: each variant carries its own
                          // paired foreground token, so neither fill can end up
                          // painting its label in the other's colour.
                          variant={plan.featured ? 'warning' : 'accent'}
                          className="h-auto min-h-11 w-full whitespace-normal py-2.5 text-center"
                        >
                          {cta}
                          <ArrowUpRight aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          asChild
                          variant="outline"
                          className="h-auto min-h-11 w-full whitespace-normal py-2.5 text-center"
                        >
                          <a href="mailto:team@rmhstudios.com?subject=Enterprise%20plan">
                            {t('contact-team', { defaultValue: 'Contact team' })}
                            <ArrowUpRight aria-hidden />
                          </a>
                        </Button>
                      )}
                    </div>
                  </article>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </div>

        {/* ── Footnote ───────────────────────────────────────── */}
        <Reveal as="p" className="mt-12 text-center font-mono text-xs text-site-text-muted">
          {t('billing-footnote', {
            defaultValue: 'Billed monthly · cancel anytime · secure checkout by Stripe',
          })}
        </Reveal>
      </div>
    </section>
  );
}

/** Scoped styles + keyframes for the membership panel. */
function PricingStyles() {
  return (
    <style>{`
      /* The pricing panel sits directly on the aurora canvas — no opaque slab
         (the old panel background was deleted with the glass redesign).

         Type comes from the token contract now (--site-font-display /
         --site-font-mono via the font utilities), not from local
         .pricing-display/.pricing-price rules that named --font-playfair and
         --font-jetbrains-mono directly and so ignored any theme that re-points
         those tokens. Card hover is likewise the shared .glass-* behaviour.
         What is left here is the one thing the system has no token for: the
         featured tier's gold ring and glow. */
      .pricing-card { transition: border-color 220ms ease, box-shadow 220ms ease; }
      .pricing-card:hover { border-color: var(--site-border-bright); }

      .pricing-card--featured {
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--site-warning) 45%, transparent),
          0 24px 60px -20px color-mix(in srgb, var(--site-warning) 35%, transparent);
      }
      .pricing-card--featured:hover {
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--site-warning) 70%, transparent),
          0 30px 70px -18px color-mix(in srgb, var(--site-warning) 45%, transparent);
      }

      /* Straddles the card's top edge. The max-width keeps a long translation
         inside the card rather than out over its neighbour. */
      .pricing-ribbon {
        position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%);
        border-radius: 9999px; padding: 4px 12px; max-width: calc(100% - 1.5rem);
        font-family: var(--site-font-mono); font-size: 10px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.16em; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        color: var(--site-warning-fg); background: var(--site-warning);
        box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--site-warning) 60%, transparent);
      }
    `}</style>
  );
}
