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
import { Check, Loader2, ArrowUpRight, ChevronDown, X } from 'lucide-react';
import type { Tier } from '@/lib/entitlements';
import { authClient } from '@/lib/auth-client';
import { PinnedHero } from '@/components/feed/PinnedHero';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion';

// Local display-only ordering (do NOT import the server-side TIER_RANK — it
// pulls the prisma client into the client bundle).
const RANK: Record<Tier, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

// Nearest scrollable ancestor of an element (the element that actually scrolls
// when its content overflows). Used so the "jump to shop" button can target the
// right scroller — on mobile the page lives inside a custom `overflow-y-auto`
// container (MobileSidebarShell), not the document.
function getScrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

// Smooth-scroll an anchor into view. `el.scrollIntoView({ behavior: 'smooth' })`
// is unreliable inside a nested (non-document) scroll container on mobile Safari,
// so when the anchor lives in a custom scroller we scroll that container directly.
function scrollToAnchor(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const scroller = getScrollParent(target);
  if (scroller) {
    const top =
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top, behavior: 'smooth' });
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

type Plan = {
  tier: Tier;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: 'current' | 'subscribe' | 'contact';
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    period: '/forever',
    tagline: 'A feel for the studio.',
    features: ['Community feed & profiles', 'Public Pages, Builds & Library', 'Standard support'],
    cta: 'current',
  },
  {
    tier: 'starter',
    name: 'Starter',
    price: '$20',
    period: '/mo',
    tagline: 'Everything unlocked — and the keys.',
    features: ['Everything in Free', 'All premium features', 'RMH API access', 'Priority support'],
    cta: 'subscribe',
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$100',
    period: '/mo',
    tagline: 'For power users who want the badge.',
    features: ['Everything in Starter', 'Verified profile badge', 'Early access to new tools', 'Dedicated support'],
    cta: 'subscribe',
    featured: true,
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'Pro, scaled to your whole company.',
    features: ['Everything in Pro', 'Seats for your team', 'Custom contract & invoicing', 'SLA & onboarding'],
    cta: 'contact',
  },
];

export function MembershipPanel({
  currentTier,
  returnPath = '/pricing',
  coinShopAnchorId,
}: {
  currentTier: Tier;
  returnPath?: string;
  /** When set, shows a ghost button beside the heading that smooth-scrolls to
   *  the element with this id (the coins shop further down the /store page). */
  coinShopAnchorId?: string;
}) {
  const { t } = useTranslation('site');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<'success' | 'cancelled' | null>(null);

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
        eyebrow={t('membership-title', { defaultValue: 'Membership' })}
        title={
          <>
            {t('hero-heading-line1', { defaultValue: 'Choose your' })}
            <br />
            <span className="text-site-accent">{t('hero-heading-line2', { defaultValue: 'altitude.' })}</span>
          </>
        }
        subtitle={t('hero-subheading', {
          defaultValue:
            'Four tiers, one studio. Unlock the full toolset, the RMH API, and a verified badge — or scale the whole thing to your company.',
        })}
        scrollCue={t('scroll-to-compare', { defaultValue: 'Compare tiers' })}
        actions={
          <>
            {currentTier !== 'free' && (
              <button
                type="button"
                onClick={manageBilling}
                disabled={busy === 'portal'}
                className="inline-flex items-center gap-2 rounded-full border border-site-border bg-site-surface px-5 py-2.5 text-sm font-semibold text-site-text transition-colors hover:bg-site-surface-hover disabled:opacity-50"
              >
                {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                {t('manage-billing', { defaultValue: 'Manage billing' })}
              </button>
            )}
            {coinShopAnchorId && (
              <button
                type="button"
                onClick={() => scrollToAnchor(coinShopAnchorId)}
                className="group inline-flex items-center gap-2 rounded-full border border-site-border bg-site-surface/40 px-5 py-2.5 text-sm font-semibold text-site-text transition-colors hover:bg-site-surface-hover"
              >
                {t('coins-shop-jump', { defaultValue: 'RMH Coins shop' })}
                <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
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
                ? t('status-success', { defaultValue: 'Welcome aboard — your membership is being activated.' })
                : t('status-cancelled', { defaultValue: 'Checkout cancelled. No charge was made.' })}
            </span>
            <button type="button" onClick={() => setStatus(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </Reveal>
        )}

        {/* ── Plan grid ──────────────────────────────────────── */}
        <RevealGroup className="grid items-stretch gap-5 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            const owned = RANK[currentTier] > RANK[plan.tier];
            return (
              <RevealItem key={plan.tier} className="flex">
                {/* Card is a plain <article> so its CSS hover/featured transforms
                    aren't clobbered by the RevealItem motion node's inline
                    transform. */}
                <article
                  // Floating L2 slabs (§8.4): . owns the frost/tint/
                  // border/ring; the featured tier additionally takes the page's
                  // one prism refract slot + ambient sheen + per-element lens.
                  data-glass-lens={plan.featured ? '' : undefined}
                  className={`pricing-card group relative flex w-full flex-col  rounded-site p-6 ${
                    plan.featured
                      ? 'pricing-card--featured glass-refract glass-refract--prism glass-liquid'
                      : ''
                  }`}
                >
                {plan.featured && (
                  <span className="pricing-ribbon">{t('most-popular', { defaultValue: 'Most popular' })}</span>
                )}
                {isCurrent && (
                  <span className="absolute right-5 top-6 rounded-full border border-site-accent/40 bg-site-accent-dim px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-site-accent">
                    {t('current-badge', { defaultValue: 'Current' })}
                  </span>
                )}

                <h2
                  className="pricing-display text-2xl text-site-text"
                  style={plan.featured ? { color: 'var(--site-warning)' } : undefined}
                >
                  {plan.name}
                </h2>
                <p className="mt-1 min-h-10 text-sm leading-snug text-site-text-muted">{plan.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="pricing-price text-4xl text-site-text">{plan.price}</span>
                  {plan.period && (
                    <span className="font-mono text-xs text-site-text-dim">{plan.period}</span>
                  )}
                </div>

                <div className="my-6 h-px w-full bg-gradient-to-r from-site-border to-transparent" />

                <ul className="flex flex-1 flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-site-text">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: plan.featured
                            ? 'color-mix(in srgb, var(--site-warning) 20%, transparent)'
                            : 'var(--site-accent-dim)',
                        }}
                      >
                        <Check
                          className="h-2.5 w-2.5"
                          style={{ color: plan.featured ? 'var(--site-warning)' : 'var(--site-accent)' }}
                        />
                      </span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7">
                  {plan.cta === 'current' && (
                    <div className="flex h-11 items-center justify-center rounded-full border border-dashed border-site-border text-sm font-medium text-site-text-dim">
                      {isCurrent ? t('your-current-plan', { defaultValue: 'Your current plan' }) : owned ? t('included', { defaultValue: 'Included' }) : t('free-forever', { defaultValue: 'Free forever' })}
                    </div>
                  )}

                  {plan.cta === 'subscribe' && (
                    <button
                      type="button"
                      onClick={() => subscribe(plan.tier as 'starter' | 'pro')}
                      disabled={isCurrent || owned || busy === plan.tier}
                      className="pricing-btn flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        background: plan.featured ? 'var(--site-warning)' : 'var(--site-accent)',
                        // Dark ink on the gold (warning) tiers; the theme's own
                        // accent foreground on accent buttons so the label stays
                        // legible on every theme (e.g. high-contrast/nocturne
                        // where accent-fg is dark, not white).
                        color: plan.featured || plan.tier === 'starter' ? '#1a1505' : 'var(--site-accent-fg)',
                      }}
                    >
                      {busy === plan.tier ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isCurrent ? (
                        t('current-plan', { defaultValue: 'Current plan' })
                      ) : owned ? (
                        t('included', { defaultValue: 'Included' })
                      ) : (
                        <>
                          {RANK[currentTier] < RANK[plan.tier] && currentTier !== 'free' ? t('upgrade', { defaultValue: 'Upgrade' }) : t('subscribe', { defaultValue: 'Subscribe' })}
                          <ArrowUpRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}

                  {plan.cta === 'contact' && (
                    <a
                      href="mailto:team@rmhstudios.com?subject=Enterprise%20plan"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-site-border-bright text-sm font-bold text-site-text transition-colors hover:bg-site-surface-hover"
                    >
                      {t('contact-team', { defaultValue: 'Contact team' })}
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  )}
                </div>
                </article>
              </RevealItem>
            );
          })}
        </RevealGroup>

        {/* ── Footnote ───────────────────────────────────────── */}
        <Reveal
          as="p"
          className="mt-12 text-center font-mono text-xs text-site-text-dim"
        >
          {t('billing-footnote', { defaultValue: 'Billed monthly · cancel anytime · secure checkout by Stripe' })}
        </Reveal>
      </div>
    </section>
  );
}

/** Scoped styles + keyframes for the membership panel. */
function PricingStyles() {
  return (
    <style>{`
      .pricing-display { font-family: var(--font-playfair); font-weight: 700; letter-spacing: -0.02em; }
      .pricing-price { font-family: var(--font-jetbrains-mono); font-weight: 600; letter-spacing: -0.04em; }

      /* The pricing panel sits directly on the aurora canvas — no opaque slab
         (the old panel background was deleted with the glass redesign). */

      /* Cards — the . class owns the frost/tint/border/blur now (§8.4);
         this only layers the hover-lift + featured gold glow on top. */
      .pricing-card {
        transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
      }
      .pricing-card:hover { transform: translateY(-4px); border-color: var(--site-border-bright); }
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
      @media (min-width: 1024px) { .pricing-card--featured { transform: translateY(-10px); } .pricing-card--featured:hover { transform: translateY(-14px); } }

      .pricing-ribbon {
        position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%);
        border-radius: 9999px; padding: 4px 14px;
        font-family: var(--font-jetbrains-mono); font-size: 10px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.18em; white-space: nowrap;
        color: #1a1505; background: var(--site-warning);
        box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--site-warning) 60%, transparent);
      }

      /* Buttons — base colors are set inline (guaranteed to paint across
         themes / style blocks); hover only adjusts brightness + lift so it
         doesn't fight the inline background. */
      .pricing-btn:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }

      @media (prefers-reduced-motion: reduce) {
        .pricing-card:hover { transform: none; }
        .pricing-card--featured, .pricing-card--featured:hover { transform: none; }
      }
    `}</style>
  );
}
