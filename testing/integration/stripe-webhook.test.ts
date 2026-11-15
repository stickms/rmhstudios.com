/**
 * The Stripe webhook — the only path by which money becomes an entitlement.
 *
 * Stripe is simulated, not mocked: the test signs real event payloads with the
 * Stripe SDK's own `generateTestHeaderString` and the shared test secret
 * (STRIPE_WEBHOOK_SECRET, set on the CI integration job and therefore seen by
 * both the booted server and this process), then POSTs them to Better Auth's
 * real `/api/auth/stripe/webhook` endpoint. The server verifies the signature
 * exactly as it does in production.
 *
 * Covered events are the ones the plugin handles WITHOUT calling the Stripe API
 * (it reads the event payload): `customer.subscription.created|updated|deleted`.
 * `checkout.session.completed` is deliberately absent: the plugin responds to
 * it by `subscriptions.retrieve(...)` against api.stripe.com, which CI cannot
 * reach (and has no key for). Checkout-session creation is likewise a live
 * Stripe call. Real Stripe is out of scope; the signed-event path is not.
 *
 * Requires on the server AND here: STRIPE_WEBHOOK_SECRET, STRIPE_STARTER_PRICE_ID,
 * STRIPE_PRO_PRICE_ID (any placeholder values; see ci-checks.yml).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { BASE_URL, Client, closeDb, db, signUp, type TestUser } from './lib/client';

afterAll(closeDb);

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STARTER = process.env.STRIPE_STARTER_PRICE_ID;
const PRO = process.env.STRIPE_PRO_PRICE_ID;
const WEBHOOK = '/api/auth/stripe/webhook';

// Only used to sign; it never makes a network call.
const signer = new Stripe('sk_test_signing_only');

let user: TestUser;
let customerId: string;
const subId = `sub_it_${Date.now().toString(36)}`;

function subscriptionObject(priceId: string, status: string, extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: subId,
    object: 'subscription',
    customer: customerId,
    status,
    metadata: {},
    cancel_at_period_end: false,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_it',
          object: 'subscription_item',
          quantity: 1,
          current_period_start: now,
          current_period_end: now + 30 * 86_400,
          price: { id: priceId, object: 'price', recurring: { interval: 'month' } },
        },
      ],
    },
    ...extra,
  };
}

function event(type: string, object: unknown) {
  return JSON.stringify({
    id: `evt_it_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
  });
}

async function send(payload: string, opts: { secret?: string; signature?: string } = {}) {
  const signature =
    opts.signature ??
    signer.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET! });
  const res = await fetch(`${BASE_URL}${WEBHOOK}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  return { status: res.status, text: await res.text() };
}

async function rows(): Promise<
  { id: string; plan: string; status: string; referenceId: string }[]
> {
  const { rows } = await db().query(
    'select id, plan, status, "referenceId" from "Subscription" where "stripeSubscriptionId" = $1',
    [subId],
  );
  return rows;
}

/** The tier the app reports for the user, bypassing the signed-cookie cache. */
async function tier(): Promise<string> {
  const res = await new Client(user.cookies).get('/api/auth/get-session?disableCookieCache=true');
  expect(res.status).toBe(200);
  return res.body.user.tier;
}

beforeAll(async () => {
  if (!SECRET || !STARTER || !PRO) {
    throw new Error(
      'stripe-webhook tests need STRIPE_WEBHOOK_SECRET, STRIPE_STARTER_PRICE_ID and STRIPE_PRO_PRICE_ID set to the ' +
        'same values on the running server and in this process (CI sets them in ci-checks.yml).',
    );
  }
  user = await signUp('stripe');
  // Sign-up would create the Stripe customer via the live API; with no key that
  // is skipped, so link the customer the way that step would have.
  customerId = `cus_it_${Date.now().toString(36)}`;
  await db().query('update "user" set "stripeCustomerId" = $1 where id = $2', [
    customerId,
    user.id,
  ]);
});

describe('stripe webhook', () => {
  it('rejects a bad or missing signature and writes nothing', async () => {
    const payload = event('customer.subscription.created', subscriptionObject(STARTER!, 'active'));

    const wrongSecret = await send(payload, { secret: 'whsec_not_the_real_one' });
    expect(wrongSecret.status).toBeGreaterThanOrEqual(400);
    expect(wrongSecret.status).toBeLessThan(500);

    const forged = await send(payload, { signature: 't=1,v1=deadbeef' });
    expect(forged.status).toBeGreaterThanOrEqual(400);
    expect(forged.status).toBeLessThan(500);

    const unsigned = await fetch(`${BASE_URL}${WEBHOOK}`, { method: 'POST', body: payload });
    expect(unsigned.status).toBeGreaterThanOrEqual(400);
    expect(unsigned.status).toBeLessThan(500);

    expect(await rows()).toHaveLength(0);
    expect(await tier()).toBe('free');
  });

  it('subscription.created grants the tier; replaying the same event is idempotent', async () => {
    const payload = event('customer.subscription.created', subscriptionObject(STARTER!, 'active'));

    const first = await send(payload);
    expect(first.status, first.text).toBe(200);
    const created = await rows();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ plan: 'starter', status: 'active', referenceId: user.id });
    expect(await tier()).toBe('starter');

    // Stripe redelivers on any non-2xx or timeout; the same event twice (and a
    // second event for the same subscription id) must not mint a second row.
    expect((await send(payload)).status).toBe(200);
    expect(
      (await send(event('customer.subscription.created', subscriptionObject(STARTER!, 'active'))))
        .status,
    ).toBe(200);
    const replayed = await rows();
    expect(replayed).toHaveLength(1);
    expect(replayed[0].id).toBe(created[0].id);
    expect(await tier()).toBe('starter');
  });

  it('subscription.updated changes the plan on the same row', async () => {
    const res = await send(
      event('customer.subscription.updated', subscriptionObject(PRO!, 'active')),
    );
    expect(res.status, res.text).toBe(200);
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ plan: 'pro', status: 'active' });
    expect(await tier()).toBe('pro');
  });

  it('subscription.deleted downgrades to free and is idempotent', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = event(
      'customer.subscription.deleted',
      subscriptionObject(PRO!, 'canceled', { canceled_at: now, ended_at: now }),
    );
    expect((await send(payload)).status).toBe(200);
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('canceled');
    expect(await tier()).toBe('free');

    expect((await send(payload)).status).toBe(200);
    expect(await rows()).toHaveLength(1);
    expect(await tier()).toBe('free');
  });

  it('an event for an unknown customer is acknowledged but grants nothing', async () => {
    const stray = {
      ...subscriptionObject(STARTER!, 'active'),
      id: `${subId}_stray`,
      customer: 'cus_nobody',
    };
    expect((await send(event('customer.subscription.created', stray))).status).toBe(200);
    const { rows: found } = await db().query(
      'select 1 from "Subscription" where "stripeSubscriptionId" = $1',
      [stray.id],
    );
    expect(found).toHaveLength(0);
  });
});
