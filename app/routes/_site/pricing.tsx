/**
 * Pricing Page Route (/pricing)
 *
 * Editorial "membership" page for the four subscription tiers. Starter & Pro
 * start Stripe-hosted checkout via the better-auth stripe client; Enterprise is
 * a sales-led "Contact team" flow. Free is the baseline. The Pro tier is
 * visually featured (gold accents echo the amber profile badge it unlocks).
 */
import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { Check, Loader2, ArrowUpRight, Sparkles, X } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { authClient } from '@/lib/auth-client';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

const fetchCurrentTier = createServerFn({ method: 'GET' }).handler(async (): Promise<Tier> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return 'free';
  return getUserTier(session.user.id);
});

export const Route = createFileRoute('/_site/pricing')({
  loader: () => fetchCurrentTier(),
  head: () => ({
    meta: [
      { title: 'Membership — RMH Studios' },
      { name: 'description', content: 'Become a member of RMH Studios. Four tiers, from Free to Enterprise.' },
    ],
  }),
  component: Pricing,
});

// Local display-only ordering (do NOT import the server-side TIER_RANK — it
// pulls the prisma client into the client bundle).
const RANK: Record<Tier, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

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

function Pricing() {
  // Cast to Tier: until app/routeTree.gen.ts regenerates (first dev/build),
  // useLoaderData() infers `any`, which breaks RANK[currentTier] indexing.
  const currentTier = Route.useLoaderData() as Tier;
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
        successUrl: '/pricing?status=success',
        cancelUrl: '/pricing?status=cancelled',
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
      const result = await authClient.subscription.billingPortal({ returnUrl: '/pricing' });
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
    <>
    <AnimatedMain
      className="pricing-root relative isolate min-h-screen w-full min-w-0 overflow-hidden border-r border-site-border pb-16 md:pb-0"
      targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
    >
      <PricingStyles />

      {/* ── Atmosphere ───────────────────────────────────────── */}
      <div aria-hidden className="pricing-glow" />
      <div aria-hidden className="pricing-grid" />
      <div aria-hidden className="pricing-grain" />

      {/* Content padding only — the center-column width is governed by
          AnimatedMain's targetWidth so the gutters match blog/library. */}
      <div className="relative px-5 py-16 sm:px-8 sm:py-20">
        {/* ── Status banner ──────────────────────────────────── */}
        {status && (
          <div
            className={`pricing-fade mb-10 flex items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 text-sm ${
              status === 'success'
                ? 'border-[color:var(--site-success)]/30 bg-[color:var(--site-success)]/10 text-[color:var(--site-success)]'
                : 'border-site-border bg-site-surface/60 text-site-text-muted'
            }`}
          >
            <span>
              {status === 'success'
                ? 'Welcome aboard — your membership is being activated.'
                : 'Checkout cancelled. No charge was made.'}
            </span>
            <button type="button" onClick={() => setStatus(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────── */}
        <header className="pricing-fade max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-site-border bg-site-surface/50 px-3.5 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-site-accent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-site-text-muted">
              Membership
            </span>
          </div>
          <h1 className="pricing-display text-5xl leading-[0.95] text-site-text sm:text-6xl">
            Choose your
            <br />
            <span className="pricing-italic text-site-accent">altitude.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-site-text-muted">
            Four tiers, one studio. Unlock the full toolset, the RMH API, and a verified
            badge — or scale the whole thing to your company.
          </p>

          {currentTier !== 'free' && (
            <button
              type="button"
              onClick={manageBilling}
              disabled={busy === 'portal'}
              className="mt-7 inline-flex items-center gap-2 rounded-full border border-site-border bg-site-surface/60 px-5 py-2.5 text-sm font-semibold text-site-text transition-colors hover:bg-site-surface-hover disabled:opacity-50"
            >
              {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              Manage billing
            </button>
          )}
        </header>

        {/* ── Plan grid ──────────────────────────────────────── */}
        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-4">
          {PLANS.map((plan, i) => {
            const isCurrent = currentTier === plan.tier;
            const owned = RANK[currentTier] > RANK[plan.tier];
            return (
              <article
                key={plan.tier}
                className={`pricing-card pricing-fade group relative flex flex-col rounded-3xl border p-6 ${
                  plan.featured
                    ? 'pricing-card--featured border-transparent bg-site-surface/70'
                    : 'border-site-border bg-site-surface/30'
                }`}
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                {plan.featured && (
                  <span className="pricing-ribbon">Most popular</span>
                )}
                {isCurrent && (
                  <span className="absolute right-5 top-6 rounded-full border border-site-accent/40 bg-site-accent-dim px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-site-accent">
                    Current
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
                      {isCurrent ? 'Your current plan' : owned ? 'Included' : 'Free forever'}
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
                        color: plan.featured || plan.tier === 'starter' ? '#1a1505' : '#ffffff',
                      }}
                    >
                      {busy === plan.tier ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isCurrent ? (
                        'Current plan'
                      ) : owned ? (
                        'Included'
                      ) : (
                        <>
                          {RANK[currentTier] < RANK[plan.tier] && currentTier !== 'free' ? 'Upgrade' : 'Subscribe'}
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
                      Contact team
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* ── Footnote ───────────────────────────────────────── */}
        <p className="pricing-fade mt-12 text-center font-mono text-xs text-site-text-dim">
          Billed monthly · cancel anytime · secure checkout by Stripe
        </p>
      </div>
    </AnimatedMain>
    {/* Trailing gutter to match the blog/library layout */}
    <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}

/** Scoped styles + keyframes for the pricing page. */
function PricingStyles() {
  return (
    <style>{`
      .pricing-display { font-family: var(--font-playfair); font-weight: 700; letter-spacing: -0.02em; }
      .pricing-italic { font-style: italic; }
      .pricing-price { font-family: var(--font-jetbrains-mono); font-weight: 600; letter-spacing: -0.04em; }

      .pricing-root { min-height: 100%; background: var(--site-bg); }

      /* Layered atmosphere */
      .pricing-glow {
        position: absolute; inset: -20% -10% auto -10%; height: 70%;
        background:
          radial-gradient(60% 60% at 30% 0%, color-mix(in srgb, var(--site-accent) 22%, transparent), transparent 70%),
          radial-gradient(50% 50% at 85% 10%, color-mix(in srgb, var(--site-warning) 12%, transparent), transparent 70%);
        filter: blur(20px); pointer-events: none; z-index: -2;
      }
      .pricing-grid {
        position: absolute; inset: 0; z-index: -2; pointer-events: none;
        background-image:
          linear-gradient(to right, color-mix(in srgb, var(--site-text) 4%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--site-text) 4%, transparent) 1px, transparent 1px);
        background-size: 56px 56px;
        mask-image: radial-gradient(120% 80% at 50% 0%, #000 30%, transparent 75%);
      }
      .pricing-grain {
        position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0.18; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }

      /* Cards */
      .pricing-card { transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease; }
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

      /* Entrance */
      @keyframes pricing-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      .pricing-fade { opacity: 0; animation: pricing-rise 620ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
      .pricing-card.pricing-fade { animation-name: pricing-rise; }

      @media (prefers-reduced-motion: reduce) {
        .pricing-fade { animation: none; opacity: 1; }
        .pricing-card:hover, .pricing-card--featured, .pricing-card--featured:hover { transform: none; }
      }
    `}</style>
  );
}
