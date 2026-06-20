# Stripe Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four-tier recurring subscription billing (Free / Starter $50/mo / Pro $500/mo / Enterprise contact-sales) to rmhstudios.com via the official `@better-auth/stripe` plugin.

**Architecture:** The `@better-auth/stripe` server plugin plugs into the existing `betterAuth()` config in `lib/auth.ts`. It auto-creates a Stripe customer per user, mounts a verified webhook under the existing `/api/auth/$` catch-all route, and syncs subscription state into a new Prisma `Subscription` model. A central `lib/entitlements.ts` module maps the synced subscription to a ranked tier and is the only thing the rest of the app reads for gating. Checkout and billing management use Stripe-hosted pages.

**Tech Stack:** TanStack Start (React 19), better-auth ^1.6.17, `@better-auth/stripe`, `stripe` Node SDK, Prisma 7 + Postgres, Vitest.

## Global Constraints

- Package manager is **pnpm** (workspace). Use `pnpm add`, never `npm`/`yarn`.
- TypeScript path alias `@/` → repo root (configured in `vite.config.ts` and `vitest.config.ts`).
- Prisma model ids use `@default(cuid())` to match the existing schema.
- Tier plan names are exactly `starter`, `pro`, `enterprise` (lowercase) everywhere — Stripe plan names, Prisma `plan` values, and entitlement mapping must agree.
- Prices: Starter **$50/month**, Pro **$500/month**, both monthly recurring. Enterprise is **not** a Stripe plan — it is a "Contact team" sales flow with no self-serve checkout.
- Entitlements are cumulative and ranked: `free < starter < pro < enterprise`. Starter unlocks everything + RMH API access; Pro adds the profile badge; Enterprise inherits Pro perks.
- Unit tests live under `lib/__tests__/**/*.test.ts` (Vitest, `globals: true`, node env). Run with `node_modules/.bin/vitest run`.
- Stripe secret key, webhook secret, and price ids come from env only — never hardcode keys.

---

### Task 1: Install dependencies and document env vars

**Files:**
- Modify: `package.json` (via `pnpm add`)
- Modify: `.env.example` (replace the existing commented Stripe placeholders)

**Interfaces:**
- Consumes: nothing.
- Produces: the `stripe` and `@better-auth/stripe` packages on disk; env var names `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`.

- [ ] **Step 1: Install the packages**

Run:
```bash
pnpm add stripe @better-auth/stripe
```

- [ ] **Step 2: Verify they resolve**

Run:
```bash
ls node_modules/@better-auth/stripe/package.json && ls node_modules/stripe/package.json
```
Expected: both paths print (no "No such file").

- [ ] **Step 3: Replace the Stripe env placeholders in `.env.example`**

Find the existing block (currently near the bottom of the file):
```
# STRIPE_SECRET_KEY=sk_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_INSIDER_PRICE_ID=price_...
# STRIPE_OPERATOR_PRICE_ID=price_...
```
Replace it with:
```
# ─── Stripe subscriptions ───────────────────────────────────────────
# Server secret key (test mode: sk_test_...). Required to enable billing.
# STRIPE_SECRET_KEY=sk_test_...
# Webhook signing secret from the Stripe dashboard endpoint (whsec_...).
# STRIPE_WEBHOOK_SECRET=whsec_...
# Recurring price IDs (monthly): Starter $50, Pro $500. Enterprise is sales-led, no price.
# STRIPE_STARTER_PRICE_ID=price_...
# STRIPE_PRO_PRICE_ID=price_...
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "feat(billing): add stripe + better-auth stripe deps and env vars"
```

---

### Task 2: Add Prisma `Subscription` model and `stripeCustomerId`

**Files:**
- Modify: `prisma/schema.prisma` (add `stripeCustomerId` to `User`; add `Subscription` model)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma client model `prisma.subscription` with fields `{ id, plan, referenceId, stripeCustomerId?, stripeSubscriptionId?, status?, periodStart?, periodEnd?, cancelAtPeriodEnd?, seats?, trialStart?, trialEnd? }`; `User.stripeCustomerId?`.

- [ ] **Step 1: Add `stripeCustomerId` to the `User` model**

In `prisma/schema.prisma`, inside `model User { ... }`, add this line next to the other scalar fields (e.g. just after `image String?`):
```prisma
  stripeCustomerId String?  // Stripe customer id (set by @better-auth/stripe on signup)
```

- [ ] **Step 2: Add the `Subscription` model**

Append to `prisma/schema.prisma`:
```prisma
// Stripe subscription state, synced by @better-auth/stripe via webhook.
model Subscription {
  id                   String    @id @default(cuid())
  plan                 String    // "starter" | "pro" | "enterprise"
  referenceId          String    // the owning User.id
  stripeCustomerId     String?
  stripeSubscriptionId String?
  status               String?   // active | trialing | past_due | canceled | incomplete | ...
  periodStart          DateTime?
  periodEnd            DateTime?
  cancelAtPeriodEnd    Boolean?
  seats                Int?
  trialStart           DateTime?
  trialEnd             DateTime?

  @@index([referenceId])
  @@index([stripeCustomerId])
}
```

- [ ] **Step 3: Apply the migration**

Run:
```bash
pnpm run db:migrate -- --name add_stripe_subscriptions
```
Expected: Prisma creates a migration under `prisma/migrations/` and regenerates the client without errors.

- [ ] **Step 4: Verify the client typechecks against the new model**

Run:
```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i "subscription" || echo "no subscription type errors"
```
Expected: prints `no subscription type errors`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(billing): add Subscription model and User.stripeCustomerId"
```

---

### Task 3: Entitlements module with unit tests (TDD)

**Files:**
- Create: `lib/entitlements.ts`
- Test: `lib/__tests__/entitlements.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma.server`; the `Subscription` model from Task 2.
- Produces:
  - `type Tier = 'free' | 'starter' | 'pro' | 'enterprise'`
  - `const TIER_RANK: Record<Tier, number>`
  - `mapPlanToTier(plan: string | null | undefined): Tier`
  - `tierFromSubscription(sub: { plan?: string | null; status?: string | null } | null | undefined): Tier`
  - `hasApiAccess(tier: Tier): boolean`
  - `hasBadge(tier: Tier): boolean`
  - `getUserTier(userId: string): Promise<Tier>`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/entitlements.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  TIER_RANK,
  mapPlanToTier,
  tierFromSubscription,
  hasApiAccess,
  hasBadge,
} from '@/lib/entitlements';

describe('mapPlanToTier', () => {
  it('maps known plan names', () => {
    expect(mapPlanToTier('starter')).toBe('starter');
    expect(mapPlanToTier('pro')).toBe('pro');
    expect(mapPlanToTier('enterprise')).toBe('enterprise');
  });
  it('defaults unknown / empty plans to free', () => {
    expect(mapPlanToTier(null)).toBe('free');
    expect(mapPlanToTier(undefined)).toBe('free');
    expect(mapPlanToTier('bogus')).toBe('free');
  });
});

describe('tierFromSubscription', () => {
  it('entitles only active or trialing subscriptions', () => {
    expect(tierFromSubscription({ plan: 'pro', status: 'active' })).toBe('pro');
    expect(tierFromSubscription({ plan: 'starter', status: 'trialing' })).toBe('starter');
  });
  it('treats inactive statuses as free', () => {
    expect(tierFromSubscription({ plan: 'pro', status: 'past_due' })).toBe('free');
    expect(tierFromSubscription({ plan: 'pro', status: 'canceled' })).toBe('free');
    expect(tierFromSubscription({ plan: 'pro', status: null })).toBe('free');
    expect(tierFromSubscription(null)).toBe('free');
  });
});

describe('gating helpers', () => {
  it('hasApiAccess is starter and above', () => {
    expect(hasApiAccess('free')).toBe(false);
    expect(hasApiAccess('starter')).toBe(true);
    expect(hasApiAccess('pro')).toBe(true);
    expect(hasApiAccess('enterprise')).toBe(true);
  });
  it('hasBadge is pro and above', () => {
    expect(hasBadge('free')).toBe(false);
    expect(hasBadge('starter')).toBe(false);
    expect(hasBadge('pro')).toBe(true);
    expect(hasBadge('enterprise')).toBe(true);
  });
  it('ranks tiers cumulatively', () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.starter);
    expect(TIER_RANK.starter).toBeLessThan(TIER_RANK.pro);
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.enterprise);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node_modules/.bin/vitest run lib/__tests__/entitlements.test.ts
```
Expected: FAIL — cannot resolve `@/lib/entitlements`.

- [ ] **Step 3: Implement `lib/entitlements.ts`**

Create `lib/entitlements.ts`:
```ts
import { prisma } from '@/lib/prisma.server';

export type Tier = 'free' | 'starter' | 'pro' | 'enterprise';

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

// Subscription statuses that grant entitlement.
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Map a Stripe/Prisma plan name to a tier. Unknown -> free. */
export function mapPlanToTier(plan: string | null | undefined): Tier {
  switch (plan) {
    case 'starter':
      return 'starter';
    case 'pro':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

/** Resolve the entitled tier for a single subscription record. Fails closed to free. */
export function tierFromSubscription(
  sub: { plan?: string | null; status?: string | null } | null | undefined,
): Tier {
  if (!sub || !sub.status || !ACTIVE_STATUSES.has(sub.status)) return 'free';
  return mapPlanToTier(sub.plan);
}

/** Starter and above get programmatic RMH API access. */
export function hasApiAccess(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.starter;
}

/** Pro and above (incl. enterprise) get the profile badge. */
export function hasBadge(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.pro;
}

/** Highest currently-active tier for a user, read from synced Subscription rows. */
export async function getUserTier(userId: string): Promise<Tier> {
  const subs = await prisma.subscription.findMany({
    where: { referenceId: userId },
    select: { plan: true, status: true },
  });
  let best: Tier = 'free';
  for (const sub of subs) {
    const tier = tierFromSubscription(sub);
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
node_modules/.bin/vitest run lib/__tests__/entitlements.test.ts
```
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/entitlements.ts lib/__tests__/entitlements.test.ts
git commit -m "feat(billing): add entitlements module with tier gating + tests"
```

---

### Task 4: Wire the Stripe plugin into the auth server

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID` from env; plan names `starter`/`pro` from the Global Constraints.
- Produces: the webhook endpoint `/api/auth/stripe/webhook` (served by the existing `/api/auth/$` catch-all) and server-side subscription endpoints consumed by Task 5's client.

- [ ] **Step 1: Add imports at the top of `lib/auth.ts`**

After the existing imports (the last is `import { generateHandle } from "@/lib/handle";`), add:
```ts
import Stripe from "stripe";
import { stripe } from "@better-auth/stripe";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
```
Note: if TypeScript reports `apiVersion` is required, set it to the SDK default: `new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: Stripe.LatestApiVersion })`.

- [ ] **Step 2: Add a `plugins` array to the `betterAuth({...})` config**

In the `betterAuth({ ... })` call, add a top-level `plugins` key (place it after the `databaseHooks` block, before the closing `})`):
```ts
    plugins: [
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: true,
            subscription: {
                enabled: true,
                plans: [
                    {
                        name: "starter",
                        priceId: process.env.STRIPE_STARTER_PRICE_ID!,
                    },
                    {
                        name: "pro",
                        priceId: process.env.STRIPE_PRO_PRICE_ID!,
                    },
                ],
                // A user may only manage a subscription whose reference is their own id.
                authorizeReference: async ({ user, referenceId }) => {
                    return referenceId === user.id;
                },
            },
        }),
    ],
```

- [ ] **Step 3: Typecheck the auth config**

Run:
```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i "lib/auth.ts" || echo "auth.ts typechecks"
```
Expected: prints `auth.ts typechecks`. If `authorizeReference`'s argument types mismatch, hover the `subscription` option in the installed `@better-auth/stripe` types and align the destructured param names — do not change the reference-equality logic.

- [ ] **Step 4: Verify the webhook route is reachable (dev smoke test)**

Start the app (`pnpm run dev`) in a separate terminal, then run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:7005/api/auth/stripe/webhook -H "Content-Type: application/json" -d '{}'
```
Expected: `400` (signature verification rejects the unsigned body) — this confirms the endpoint exists and is verifying signatures, not `404`.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(billing): wire @better-auth/stripe plugin into auth server"
```

---

### Task 5: Wire the Stripe client plugin

**Files:**
- Modify: `lib/auth-client.ts`

**Interfaces:**
- Consumes: the server subscription endpoints from Task 4.
- Produces: `authClient.subscription.upgrade(...)`, `authClient.subscription.list(...)`, `authClient.subscription.cancel(...)` for use in Task 6's UI.

- [ ] **Step 1: Replace `lib/auth-client.ts` with the plugin-enabled client**

Overwrite `lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";

export const authClient = createAuthClient({
  plugins: [
    stripeClient({
      subscription: true,
    }),
  ],
});
```

- [ ] **Step 2: Confirm the available subscription client actions**

Run:
```bash
grep -rEo "upgrade|cancel|billingPortal|restore|list" node_modules/@better-auth/stripe/dist/*.d.ts 2>/dev/null | sort -u
```
Expected: lists the action names exported by the client plugin. Note which of `cancel` / `billingPortal` exists — Task 6 uses whichever opens the Stripe billing portal (prefer `billingPortal` if present, else `cancel`).

- [ ] **Step 3: Typecheck**

Run:
```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i "auth-client.ts" || echo "auth-client.ts typechecks"
```
Expected: prints `auth-client.ts typechecks`.

- [ ] **Step 4: Commit**

```bash
git add lib/auth-client.ts
git commit -m "feat(billing): add stripe subscription client plugin"
```

---

### Task 6: Pricing page and TierBadge component

**Files:**
- Create: `app/routes/_site/pricing.tsx`
- Create: `components/billing/TierBadge.tsx`

**Interfaces:**
- Consumes: `authClient.subscription.*` from Task 5; `getUserTier`, `hasBadge`, `type Tier` from Task 3; `auth.api.getSession` for the loader.
- Produces: the `/pricing` route and a reusable `<TierBadge tier={tier} />` component.

- [ ] **Step 1: Create the `TierBadge` component**

Create `components/billing/TierBadge.tsx`:
```tsx
import type { Tier } from '@/lib/entitlements';
import { hasBadge } from '@/lib/entitlements';

const LABELS: Record<Tier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/** Renders a small tier badge for Pro+ users; nothing for free/starter. */
export function TierBadge({ tier }: { tier: Tier }) {
  if (!hasBadge(tier)) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
      {LABELS[tier]}
    </span>
  );
}
```

- [ ] **Step 2: Create the pricing page route**

Create `app/routes/_site/pricing.tsx`:
```tsx
/**
 * Pricing Page Route (/pricing)
 *
 * Four subscription tiers. Starter & Pro start Stripe-hosted checkout via the
 * better-auth stripe client; Enterprise is a sales-led "Contact team" flow.
 */
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { authClient } from '@/lib/auth-client';

const fetchCurrentTier = createServerFn({ method: 'GET' }).handler(async (): Promise<Tier> => {
  const request = getWebRequest();
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

  async function subscribe(plan: 'starter' | 'pro') {
    await authClient.subscription.upgrade({
      plan,
      successUrl: '/pricing?status=success',
      cancelUrl: '/pricing?status=cancelled',
    });
  }

  // Opens the Stripe-hosted billing portal. Use whichever action Task 5 Step 2
  // confirmed exists; `cancel` opens the portal in better-auth stripe, prefer
  // `billingPortal` if the installed plugin exports it.
  async function manageBilling() {
    await authClient.subscription.cancel({ returnUrl: '/pricing' });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pricing</h1>
        {currentTier !== 'free' && (
          <button
            type="button"
            onClick={manageBilling}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold"
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
                  disabled={currentTier === p.tier}
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
```
Note: if `getWebRequest` is not exported from `@tanstack/react-start/server` in this version, read how an existing server function obtains the request (`grep -rn "getWebRequest\|createServerFn" app/routes/api`), and match that pattern. The loader must end up calling `auth.api.getSession({ headers: request.headers })`.

- [ ] **Step 3: Typecheck and lint the new files**

Run:
```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "pricing.tsx|TierBadge.tsx" || echo "billing UI typechecks"
pnpm run lint -- app/routes/_site/pricing.tsx components/billing/TierBadge.tsx
```
Expected: `billing UI typechecks` and no lint errors.

- [ ] **Step 4: Manual smoke test of the page**

With `pnpm run dev` running, open `http://localhost:7005/pricing`.
Expected: four cards render; Free shows current-plan text, Starter/Pro show a Subscribe button, Enterprise shows a "Contact team" mailto link.

- [ ] **Step 5: Commit**

```bash
git add app/routes/_site/pricing.tsx components/billing/TierBadge.tsx app/routeTree.gen.ts
git commit -m "feat(billing): add pricing page and TierBadge component"
```

---

### Task 7: End-to-end verification in Stripe test mode

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–6.

- [ ] **Step 1: Create test-mode products in Stripe**

In the Stripe dashboard (test mode), create two recurring monthly prices — Starter $50/mo and Pro $500/mo — and copy their `price_...` ids.

- [ ] **Step 2: Populate `.env` (not `.env.example`)**

Set `STRIPE_SECRET_KEY` (test `sk_test_...`), `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`. For the webhook secret, run the Stripe CLI listener:
```bash
stripe listen --forward-to localhost:7005/api/auth/stripe/webhook
```
Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`, then restart `pnpm run dev`.

- [ ] **Step 3: Run a checkout as a logged-in user**

Log in, go to `/pricing`, click **Subscribe** on Starter. Complete Stripe-hosted checkout with test card `4242 4242 4242 4242`, any future expiry/CVC.
Expected: redirect back to `/pricing?status=success`.

- [ ] **Step 4: Verify the subscription synced and the tier resolved**

Run:
```bash
node_modules/.bin/tsx -e "import {prisma} from './lib/prisma.server'; prisma.subscription.findMany().then(r=>{console.log(r); process.exit(0)})"
```
Expected: one row with `plan: 'starter'`, `status: 'active'`, and a `referenceId` matching your user id. Reload `/pricing`; the Starter card now shows "Current plan".

- [ ] **Step 5: Verify gating end-to-end**

Confirm `getUserTier(<your id>)` returns `'starter'` and `hasApiAccess('starter')` is `true` (e.g. via a quick `tsx -e` script importing from `@/lib/entitlements`). This proves the synced subscription drives entitlements.

---

## Notes / out of scope (per spec guardrails)

- **Enterprise provisioning** has no self-serve path. The entitlements code already resolves a `plan: 'enterprise'` subscription to the `enterprise` tier, so an enterprise customer is provisioned later by manually creating that subscription/invoice in Stripe — no code change needed here.
- **RMH API key issuance UI** is deferred; only the `hasApiAccess` gate ships now. Enforce it at the existing `X-RMHCode-Token` check in `lib/rmhcode-auth.ts` when API gating is built.
- Yearly prices, proration UI, and an in-app invoice list are out of scope — the Stripe customer portal covers billing management.
