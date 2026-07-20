// NOTE: the reflect-metadata polyfill that the passkey plugin (via tsyringe)
// needs is installed at server startup by the Nitro plugin in
// server/nitro/reflect-metadata.ts — a source-level import here is tree-shaken
// and reordered after the passkey chunk, so it must live in the startup plugin.
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma.server';
import { generateHandle } from '@/lib/handle';
import Stripe from 'stripe';
import { stripe } from '@better-auth/stripe';
import { customSession } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { getUserTier } from '@/lib/entitlements';
import { sendEmail } from '@/lib/email/send.server';

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Email verification / password reset only make sense when a transport is
// actually configured. `sendEmail` no-ops (logs) without RESEND_API_KEY, so
// enforcing verification in that state would lock every new user out of
// local/dev/CI and any deploy without email — which is exactly why this
// hardening (#408) was deferred until a transport existed. Gating on the key
// activates the protection precisely when email can be delivered.
const emailConfigured = Boolean(process.env.RESEND_API_KEY);

/** Minimal branded transactional-email shell (inline styles — email clients strip <style>). */
function emailShell(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 20px">${body}</p>
  <a href="${cta.url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${cta.label}</a>
  <p style="font-size:12px;color:#666;margin:20px 0 0;word-break:break-all">Or paste this link into your browser: ${cta.url}</p>
</div>`;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  trustedOrigins: [
    'https://rmhstudios.com',
    'https://www.rmhstudios.com',
    'https://staging.rmhstudios.com',
  ],
  advanced: {
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith('https'),
  },
  session: {
    // Signed session snapshot cached in the cookie so the common case
    // (validate the current session) does NOT hit the session/user table on
    // every request — the single biggest per-request DB read at scale.
    // TTL is 5 minutes: idle-tab pollers (presence, unread counts, feed SSE)
    // then revalidate without a session/user lookup for most of their life.
    // The tradeoff is revocation latency — a ban or sign-out can stay stale
    // for up to 5 minutes; that window is acceptable for this app.
    cookieCache: {
      enabled: true,
      maxAge: 300, // seconds
    },
  },
  // Throttle auth endpoints to blunt credential stuffing / account enumeration.
  // Defaults cover all auth routes; the stricter custom rules target the
  // sign-in/sign-up/forgot-password paths. Storage is in-memory per process;
  // set BETTER_AUTH_RATE_LIMIT_DB=1 to coordinate across processes via the DB.
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 200, // default per-window cap across auth routes
    storage: process.env.BETTER_AUTH_RATE_LIMIT_DB === '1' ? 'database' : 'memory',
    // Kept tighter than the rest (these guard against credential brute-force),
    // but loosened enough that legitimate retries/typos aren't blocked.
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 10 },
      '/forget-password': { window: 60, max: 6 },
      '/reset-password': { window: 60, max: 10 },
    },
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      overrideUserInfoOnSignIn: true,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      overrideUserInfoOnSignIn: true,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      overrideUserInfoOnSignIn: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    // Prove ownership of the address before a credential account becomes usable.
    // This is the linchpin against account pre-hijacking (#408): an attacker can
    // no longer pre-register `victim@example.com` with a password and keep a
    // usable account — the verification link goes to the real inbox owner, so
    // the seeded account stays unverified and unable to sign in. Enforced only
    // when a live email transport exists (see `emailConfigured`).
    requireEmailVerification: emailConfigured,
    // Make self-service password reset operable (the `/forget-password` and
    // `/reset-password` rate rules above previously had no transport behind them).
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your RMH Studios password',
        html: emailShell(
          'Reset your password',
          'We received a request to reset the password for your RMH Studios account. This link expires shortly. If you did not request this, you can safely ignore this email.',
          { label: 'Reset password', url },
        ),
        text: `Reset your RMH Studios password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: emailConfigured,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your RMH Studios email',
        html: emailShell(
          'Verify your email',
          'Confirm this address to finish setting up your RMH Studios account.',
          { label: 'Verify email', url },
        ),
        text: `Verify your RMH Studios email: ${url}`,
      });
    },
  },
  account: {
    // Account-linking policy hardening (#408). Never auto-link a social identity
    // across differing email addresses, and deliberately keep the social
    // providers OUT of `trustedProviders` so linking requires the provider to
    // have verified the email and cannot silently attach onto a pre-existing,
    // unverified credential account.
    accountLinking: {
      enabled: true,
      trustedProviders: [],
      allowDifferentEmails: false,
    },
  },
  user: {
    additionalFields: {
      username: {
        type: 'string',
        required: false,
        input: true,
      },
      handle: {
        type: 'string',
        required: false,
      },
      isAdmin: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
      isVerified: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-assign a handle to new users if they don't have one
          if (!user.handle) {
            const handle = await generateHandle(
              (user as { username?: string }).username || user.name,
            );
            await prisma.user.update({
              where: { id: user.id },
              data: { handle },
            });
          }
        },
      },
    },
  },
  plugins: [
    // WebAuthn/passkey sign-in. rpID/origin default from baseURL; override
    // via env when serving from multiple hostnames (e.g. www + apex).
    passkey({
      rpName: 'RMH Studios',
      ...(process.env.PASSKEY_RP_ID ? { rpID: process.env.PASSKEY_RP_ID } : {}),
      ...(process.env.PASSKEY_ORIGIN ? { origin: process.env.PASSKEY_ORIGIN.split(',') } : {}),
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: [
          {
            name: 'starter',
            priceId: process.env.STRIPE_STARTER_PRICE_ID!,
          },
          {
            name: 'pro',
            priceId: process.env.STRIPE_PRO_PRICE_ID!,
          },
        ],
        // A user may only manage a subscription whose reference is their own id.
        authorizeReference: async ({ user, referenceId }) => {
          return referenceId === user.id;
        },
      },
    }),
    customSession(async ({ user, session }) => {
      const tier = await getUserTier(user.id);
      return { user: { ...user, tier }, session };
    }),
  ],
});
