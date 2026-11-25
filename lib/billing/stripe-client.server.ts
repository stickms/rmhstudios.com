/**
 * The one Stripe client of the server (s12-18). `lib/auth.ts` hands it to the Better Auth plugin, and the
 * deletion billing steps call it directly, so server code can reach Stripe without importing auth.
 *
 * With `STRIPE_SECRET_KEY` unset the client is built with the placeholder `sk_unconfigured`: it constructs fine
 * (a missing key must not take every page down, see `lib/auth.ts`), and any real call fails at request time.
 * Callers that act on Stripe check `stripeConfigured()` first and log-and-return.
 *
 * Tests never reach Stripe: under vitest this getter throws for any key other than the placeholder or a
 * `sk_test_` key, so a test run that inherited production secrets fails instead of calling live Stripe. Tests
 * that need a client `vi.mock` this module and return a fake.
 */
import Stripe from 'stripe';

export const STRIPE_UNCONFIGURED_KEY = 'sk_unconfigured';

/** The key the process runs with, or the placeholder. */
export function stripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || STRIPE_UNCONFIGURED_KEY;
}

/** Whether a real key is set. Billing steps log and return when it is not. */
export function stripeConfigured(): boolean {
  return stripeSecretKey() !== STRIPE_UNCONFIGURED_KEY;
}

let cached: { key: string; client: Stripe } | null = null;

export function getStripeClient(): Stripe {
  const key = stripeSecretKey();
  if (process.env.VITEST && key !== STRIPE_UNCONFIGURED_KEY && !key.startsWith('sk_test_')) {
    throw new Error('Refusing to build a live Stripe client under vitest; inject a fake client instead.');
  }
  if (!cached || cached.key !== key) cached = { key, client: new Stripe(key) };
  return cached.client;
}
