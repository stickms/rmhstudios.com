# Stripe Subscriptions — Design

**Date:** 2026-06-19
**Status:** Approved (design), pending implementation plan
**Branch:** `stripe-payment-integratio`

## Summary

Add recurring subscription billing to rmhstudios.com using Stripe, integrated
through the official `@better-auth/stripe` plugin so subscription state lives
next to the existing `better-auth` + Prisma user model. Four tiers, cumulative
entitlements, Stripe-hosted checkout and customer portal.

## Tiers

| Tier       | Price        | Billing | Self-serve | Unlocks (cumulative)                  |
|------------|--------------|---------|------------|---------------------------------------|
| Free       | $0           | —       | n/a        | Baseline access                       |
| Starter    | $50/mo       | monthly | ✅ checkout | Everything + RMH API access           |
| Pro        | $500/mo      | monthly | ✅ checkout | Starter perks + profile badge         |
| Enterprise | Contact team | —       | ❌ sales    | Pro perks, sold to companies          |

Entitlements are cumulative and ranked: `free < starter < pro < enterprise`.
Enterprise is **not** a Stripe plan — it is a sales-led "Contact team" flow
(mailto or contact route), so no self-serve checkout exists for it.

## Approach

Use the official **`@better-auth/stripe`** plugin (Approach A of the
brainstorm). Rationale: it matches the stack (`better-auth` in `lib/auth.ts` +
Prisma/Postgres), auto-creates Stripe customers, syncs subscription state via a
verified webhook it mounts itself, and exposes client methods for
checkout/portal — far less custom code and fewer edge cases than a hand-rolled
integration.

## Components

### 1. Dependencies
- `stripe` — Node SDK.
- `@better-auth/stripe` — server plugin + `@better-auth/stripe/client` client plugin.

### 2. Auth server wiring — `lib/auth.ts`
Add the `stripe` plugin to the existing `betterAuth({...})`:
- `Stripe` client from `STRIPE_SECRET_KEY`.
- `createCustomerOnSignUp: true`.
- `stripeWebhookSecret: STRIPE_WEBHOOK_SECRET`.
- `subscription.enabled: true` with `plans`:
  - `starter` → `STRIPE_STARTER_PRICE_ID`
  - `pro` → `STRIPE_PRO_PRICE_ID`
- `authorizeReference` callback so a user can only act on their own subscription
  (reference id === session user id).

The plugin auto-mounts the verified webhook at `/api/auth/stripe/webhook`
(raw-body verification handled internally). No custom webhook route is written.

### 3. Auth client — `lib/auth-client.ts`
Add `stripeClient({ subscription: true })` to `createAuthClient`, exposing
`authClient.subscription.upgrade()`, `.list()`, `.cancel()`, and the
billing-portal call on the frontend.

### 4. Prisma schema — `prisma/schema.prisma`
Plugin requires:
- `stripeCustomerId String?` on `User`.
- A `Subscription` model (`plan`, `referenceId`, `stripeCustomerId`,
  `stripeSubscriptionId`, `status`, `periodStart`, `periodEnd`,
  `cancelAtPeriodEnd`, `seats`).

Generate with `npx @better-auth/cli generate`, review the diff, then
`pnpm run db:migrate`.

### 5. Entitlements module — `lib/entitlements.ts`
Single source of truth; the rest of the app never touches Stripe directly.
```
type Tier = 'free' | 'starter' | 'pro' | 'enterprise'
const TIER_RANK: Record<Tier, number>          // free=0 … enterprise=3
getUserTier(user | userId): Promise<Tier>       // active Subscription.status → plan → tier; default 'free'
hasApiAccess(tier): boolean                     // tier rank >= starter
hasBadge(tier): boolean                         // tier rank >= pro
```
"Active" = subscription status in (`active`, `trialing`). `past_due`,
`canceled`, `incomplete` → treated as not entitled (default free).

### 6. UI
- **Pricing page** — `app/routes/_site/pricing.tsx`. Four cards
  (Free / Starter $50/mo / Pro $500/mo / Enterprise). Starter & Pro buttons call
  `authClient.subscription.upgrade({ plan, successUrl, cancelUrl })`.
  Enterprise renders a "Contact team" button (mailto/contact route).
- **Manage billing** — shown when the user has an active subscription; opens the
  Stripe customer portal via the plugin's portal call.
- **`TierBadge`** — small component rendered on profiles for Pro+ users.

### 7. RMH API access
Scoped to the **entitlement flag only** this pass. `hasApiAccess(tier)` is
checked wherever programmatic API access is enforced; the existing
`X-RMHCode-Token` auth in `lib/rmhcode-auth.ts` is the natural enforcement point.
API-key issuance/management UI is an explicit follow-up, out of scope here.

### 8. Env / config — `.env.example`
Uncomment and align names (existing placeholders were `INSIDER`/`OPERATOR`):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`

No publishable key required (Stripe-hosted checkout + portal).

## Data flow

1. User clicks **Subscribe** on a plan → `authClient.subscription.upgrade()` →
   Stripe-hosted Checkout.
2. On success Stripe redirects to `successUrl`; asynchronously Stripe calls the
   plugin webhook → plugin upserts the `Subscription` row.
3. App reads entitlements via `getUserTier()` (driven by the synced
   `Subscription` row), never by calling Stripe at request time.
4. **Manage billing** → Stripe customer portal handles upgrades, downgrades,
   cancellation, payment-method and invoice management.

## Error handling
- Webhook signature verification is handled by the plugin; a failed signature
  returns 400 and does not mutate state.
- Entitlement reads default to `free` when no active subscription exists, so a
  missing/lagging webhook fails closed (no accidental access).
- Checkout cancellation returns the user to `cancelUrl` with no state change.

## Testing
- **Unit** — `lib/entitlements.ts`: plan→tier mapping, rank-based gating
  helpers, and status edge cases (`past_due`/`canceled` → free).
- **Manual** — Stripe **test mode** with test cards: full
  checkout → webhook → tier-update → portal round trip for Starter and Pro.

## Scope guardrails (YAGNI)
Out of scope for this pass: yearly prices, proration UI, in-app invoice list
(Stripe portal covers it), API-key management UI, and Enterprise self-serve
checkout.
