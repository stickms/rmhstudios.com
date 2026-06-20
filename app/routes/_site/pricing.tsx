/**
 * Pricing Page Route (/pricing)
 *
 * Four subscription tiers. Starter & Pro start Stripe-hosted checkout via the
 * better-auth stripe client; Enterprise is a sales-led "Contact team" flow.
 */
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { authClient } from '@/lib/auth-client';

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
      { title: 'Pricing — RMH Studios' },
      { name: 'description', content: 'RMH Studios subscription plans.' },
    ],
  }),
  component: Pricing,
});

const PLANS = [
  { tier: 'free' as const, name: 'Free', price: '$0', blurb: 'Baseline access.', cta: 'current' as const },
  { tier: 'starter' as const, name: 'Starter', price: '$50/mo', blurb: 'Everything unlocked + RMH API access.', cta: 'subscribe' as const },
  { tier: 'pro' as const, name: 'Pro', price: '$500/mo', blurb: 'Starter perks + a profile badge.', cta: 'subscribe' as const },
  { tier: 'enterprise' as const, name: 'Enterprise', price: 'Contact team', blurb: 'Pro, for companies.', cta: 'contact' as const },
];

function Pricing() {
  const currentTier = Route.useLoaderData();
  const [busy, setBusy] = useState<string | null>(null);

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
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pricing</h1>
        {currentTier !== 'free' && (
          <button
            type="button"
            onClick={manageBilling}
            disabled={busy === 'portal'}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Manage billing
          </button>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <div key={p.tier} className="flex flex-col rounded-xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-2xl font-bold">{p.price}</p>
            <p className="mt-2 flex-1 text-sm text-white/70">{p.blurb}</p>
            <div className="mt-6">
              {p.cta === 'current' && (
                <span className="text-sm text-white/50">
                  {currentTier === 'free' ? 'Your current plan' : 'Included'}
                </span>
              )}
              {p.cta === 'subscribe' && (
                <button
                  type="button"
                  onClick={() => subscribe(p.tier as 'starter' | 'pro')}
                  disabled={currentTier === p.tier || busy === p.tier}
                  className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {currentTier === p.tier ? 'Current plan' : 'Subscribe'}
                </button>
              )}
              {p.cta === 'contact' && (
                <a
                  href="mailto:team@rmhstudios.com?subject=Enterprise%20plan"
                  className="block w-full rounded-lg border border-white/20 px-4 py-2 text-center text-sm font-semibold"
                >
                  Contact team
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
