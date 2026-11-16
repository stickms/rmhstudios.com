// NOTE: the reflect-metadata polyfill that the passkey plugin (via tsyringe)
// needs is installed at server startup by the Nitro plugin in
// server/nitro/reflect-metadata.ts — a source-level import here is tree-shaken
// and reordered after the passkey chunk, so it must live in the startup plugin.
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma.server';
import { generateHandle } from '@/lib/handle.server';
import Stripe from 'stripe';
import { stripe } from '@better-auth/stripe';
import { customSession } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { getUserTier, invalidateUserTier } from '@/lib/entitlements';
import { sendEmail } from '@/lib/email/send.server';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { isPlaceholderEmail } from '@/lib/auth/providers';
import { socialProviderConfig, steamApiKey } from '@/lib/auth/provider-config.server';
import { steam } from '@/lib/auth/steam.server';
import { consolidation } from '@/lib/auth/consolidation.server';
import { notifySignInChange } from '@/lib/auth/security-notice.server';
import { CREDENTIAL_PROVIDER_ID } from '@/lib/auth/providers';

// The `!` here used to be load-bearing in the worst way. `new Stripe(undefined)`
// throws "Neither apiKey nor config.authenticator provided" at CONSTRUCTION, and
// this module is in the import graph of essentially every route — so with
// STRIPE_SECRET_KEY unset, TanStack Start's `loadEntries()` (which imports every
// route entry before serving any of them) threw, and the FIRST REQUEST TO ANY
// PAGE ON THE SITE 500'd. Not the billing pages: all of them.
//
// A placeholder key removes the boot-time failure without pretending Stripe
// works: the client constructs fine and any real API call fails at request time
// with an auth error, which is the same degradation shape this file already
// chose for email (see `emailConfigured` below). A billing feature being
// unavailable when it is unconfigured is correct; the homepage being unavailable
// is not.
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unconfigured');

// Unconfigured billing must be LOUD in production even though it must not take
// the site down (above). One structured line at boot, so a deploy that lost the
// key is visible in the logs instead of surfacing as "checkout fails" later.
// Not a throw: .env.example lists the key as optional and nothing in the repo
// proves every environment (staging, previews) sets it.
if (process.env.NODE_ENV === 'production') {
  const missing = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_STARTER_PRICE_ID',
    'STRIPE_PRO_PRICE_ID',
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(JSON.stringify({ level: 'error', event: 'stripe.unconfigured', missing }));
  }
}

// Email verification / password reset only make sense when a transport is
// actually configured. `sendEmail` no-ops (logs) without RESEND_API_KEY, so
// enforcing verification in that state would lock every new user out of
// local/dev/CI and any deploy without email — which is exactly why this
// hardening (#408) was deferred until a transport existed. Gating on the key
// activates the protection precisely when email can be delivered.
const emailConfigured = Boolean(process.env.RESEND_API_KEY);

/** The one user-typed value that reaches an email body. */
function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

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
      // Reading the current session is not an attack surface (no credentials are
      // checked) but IS the hottest auth call: every page load and every window-focus
      // refetch makes one or two. Under the 200/min per-IP default, a campus/office
      // NAT or a busy tab-switcher got 429 {"message":"Too many requests"} -> the
      // client read it as "signed out" (reproduced: 281/397 get-session calls 429'd at
      // 50 concurrent users from 10 accounts). `false` disables the limit for this path.
      '/get-session': false,
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 10 },
      '/forget-password': { window: 60, max: 6 },
      '/reset-password': { window: 60, max: 10 },
      // Each one sends an email: keep them from being used to flood an inbox.
      '/send-verification-email': { window: 300, max: 3 },
      '/change-email': { window: 300, max: 5 },
      '/link-social': { window: 60, max: 10 },
      '/unlink-account': { window: 60, max: 10 },
    },
  },
  // Google sign-in is switched off (repeated problems with it, 2026-10). Nothing was deleted: existing `account` rows with
  // providerId 'google' stay in the database untouched, so it can come back by restoring a `google: { clientId, clientSecret,
  // overrideUserInfoOnSignIn: true }` entry in lib/auth/provider-config.server.ts, its id in lib/auth/providers.ts, and the
  // GOOGLE_CLIENT_* env vars. Discord and GitHub are always on; every other provider is on only when its env vars are set.
  socialProviders: socialProviderConfig(),
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
    // Signing in before confirming sends a fresh link (the old one may have
    // expired), and the login page says so. Rate-limited with /sign-in/email.
    sendOnSignIn: emailConfigured,
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
    // Account-linking policy hardening (#408), extended by account consolidation
    // (docs/superpowers/specs/2026-11-16-account-consolidation-design.md).
    //
    // Automatic linking (signing in with a provider whose email matches an
    // existing account) happens only when the provider verified that email AND
    // the local account verified it too (`requireLocalEmailVerified`, Better
    // Auth's default). The providers stay OUT of `trustedProviders`, which would
    // skip the first check, so nothing attaches onto an unverified,
    // pre-registered credential account.
    //
    // `allowDifferentEmails` only governs the EXPLICIT connect a signed-in user
    // starts from Settings (`/link-social`), never the automatic path above. The
    // OAuth round trip is what proves they own that provider account, so its
    // email need not match; the recent-sign-in rule (consolidation.server.ts) is
    // what stops a stolen session from adding a way in, and every connect is
    // announced to the account (databaseHooks.account below).
    accountLinking: {
      enabled: true,
      trustedProviders: [],
      allowDifferentEmails: true,
    },
  },
  user: {
    // Changing the email: the new address only takes effect when the link sent
    // TO it is clicked (no `updateEmailWithoutVerification`), and an account
    // whose current address is confirmed must first approve from that address,
    // so a stolen session cannot move the account to an inbox it controls.
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Approve the new email for your RMH Studios account',
          html: emailShell(
            'Approve your new email',
            `Someone asked to change the email on your RMH Studios account to ${escapeEmailHtml(newEmail)}. If it was you, approve it and we will send a link to the new address. If not, ignore this email and review your security settings.`,
            { label: 'Approve change', url },
          ),
          text: `Approve changing your RMH Studios email to ${newEmail}: ${url}`,
        });
      },
    },
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
  hooks: {
    // The placeholder domain belongs to accounts from providers that share no
    // email (Steam, sometimes X). Nobody may claim one of those
    // addresses by typing it: an email/password sign-up as
    // `<steamid>@steam.placeholder.invalid` would sit on that Steam user's
    // address, and their first Steam sign-in would then be refused as an
    // unlinked existing account.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email' && ctx.path !== '/change-email') return;
      const body = ctx.body as { email?: unknown; newEmail?: unknown } | undefined;
      const claimed = ctx.path === '/sign-up/email' ? body?.email : body?.newEmail;
      if (typeof claimed === 'string' && isPlaceholderEmail(claimed)) {
        throw new APIError('BAD_REQUEST', { message: 'Enter a valid email address.' });
      }
    }),
  },
  databaseHooks: {
    // Every new way into an existing account is announced to it, and so is every
    // removal: connect from Settings, automatic linking on sign-in, Steam. The
    // first account a user is created with is not news, nor is a password
    // (email sign-up creates it with the user).
    account: {
      create: {
        after: async (account) => {
          if (account.providerId === CREDENTIAL_PROVIDER_ID) return;
          const total = await prisma.account.count({ where: { userId: account.userId } });
          if (total <= 1) return;
          void notifySignInChange(account.userId, { kind: 'connected', providerId: account.providerId });
        },
      },
      delete: {
        after: async (account) => {
          void notifySignInChange(account.userId, { kind: 'removed', providerId: account.providerId });
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          // Auto-assign a handle to new users if they don't have one.
          if (user.handle) return;
          try {
            const handle = await generateHandle(
              (user as { username?: string }).username || user.name,
            );
            await prisma.user.update({
              where: { id: user.id },
              data: { handle },
            });
            // A handle derived from a display name is guessable, so someone may
            // already have hit `/@handle` and had that 404 negative-cached
            // (OPT-47). Creating the account is what makes the name resolve, so
            // it is also what has to forget the miss. Dynamically imported to
            // keep the profile module out of the auth boot graph.
            void import('@/lib/profile.server')
              .then((m) => m.invalidateProfileLookup(handle))
              .catch((err) => console.error('[auth] profile lookup invalidate failed:', err));
          } catch (error) {
            // Two accounts racing for the same candidate lose the unique index
            // here. Signing up matters more than the handle, so swallow it —
            // `backfillMissingHandles` (pnpm handles:backfill) sweeps up anyone
            // left without one.
            console.error('Auto-handle assignment failed:', error);
          }
        },
      },
    },
    session: {
      create: {
        after: async (session, ctx) => {
          const request = ctx?.request;
          if (!request) return;

          // Both are deliberately un-awaited. Neither may sit in front of the
          // sign-in response: a slow email send or a stray database hiccup
          // would turn "sign in" into "sign in, eventually". Both swallow their
          // own errors, so a rejection here can never surface as a failed
          // login.

          // B11 — fingerprint the device and alert the owner the first time an
          // unfamiliar one signs in. Sessions were listable but never
          // announced, which only helps someone who already suspects a problem.
          void import('@/lib/auth/session-alert.server')
            .then((m) => m.onSessionCreated(session, request))
            .catch((err) => console.error('[auth] session alert failed:', err));

          // B12 — signing back in is the cancel flow for a scheduled deletion.
          // It is the only one users reliably find, so it has to be the one
          // that works.
          void import('@/lib/account/deletion.server')
            .then((m) => m.cancelDeletion(session.userId))
            .catch((err) => console.error('[auth] deletion cancel failed:', err));
        },
      },
    },
  },
  plugins: [
    // Steam sign-in (OpenID 2.0, so a plugin rather than a socialProviders
    // entry). Always registered so the plugin tuple keeps its type; its
    // endpoints answer 404 unless STEAM_API_KEY is set.
    steam({ apiKey: steamApiKey }),
    // Recent-sign-in rule and the empty-account merge (account-merge/*).
    consolidation(),
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
        // `getUserTier` is cached for 60s and the plugin writes the Subscription
        // row without telling it, so a member would stay "free" for up to a
        // minute after paying (and stay paid after cancelling). Drop the cached
        // tier whenever a webhook changes the row.
        onSubscriptionComplete: async ({ subscription }) =>
          invalidateUserTier(subscription.referenceId),
        onSubscriptionCreated: async ({ subscription }) =>
          invalidateUserTier(subscription.referenceId),
        onSubscriptionUpdate: async ({ subscription }) =>
          invalidateUserTier(subscription.referenceId),
        onSubscriptionDeleted: async ({ subscription }) =>
          invalidateUserTier(subscription.referenceId),
      },
    }),
    customSession(async ({ user, session }) => {
      const tier = await getUserTier(user.id);
      return { user: { ...user, tier }, session };
    }),
  ],
});

/* ── Revocation-safe sessions on writes ────────────────────────────────────
 *
 * `session.cookieCache` (above) lets getSession trust the signed `session_data`
 * cookie for `maxAge` seconds without reading the session row. That is what
 * keeps the hottest auth path cheap — but it also means a session deleted
 * server-side (sign-out, a revoke) keeps working for up to `maxAge` for anyone
 * holding a copy of its cookies. The integration suite caught exactly that: a
 * cookie copied before sign-out still got a 201 from POST /api/rmharks.
 *
 * So the cache is kept for reads and dropped for writes. Every server-side
 * `auth.api.getSession` call — `defineHandler` and the ~100 routes that call it
 * directly — goes through this wrapper; when the current request is not a safe
 * method (GET/HEAD/OPTIONS) it forces `disableCookieCache`, i.e. one indexed
 * session-row read per write, and a revoked session is refused immediately.
 * Reads, SSR renders and Better Auth's own `/api/auth/get-session` endpoint
 * (served by its router, not through this property) keep the cache — a revoked
 * session can still READ for up to `maxAge`, which is the accepted trade.
 *
 * Fail-safe: if the request (and so its method) cannot be determined — code
 * running outside a request, a worker — the cache is skipped. The request
 * helper is imported lazily so this module stays importable outside the
 * TanStack Start runtime.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function currentRequestIsSafe(): Promise<boolean> {
  try {
    const { getRequest } = await import('@tanstack/react-start/server');
    const method = (getRequest() as Request | undefined)?.method?.toUpperCase();
    return method !== undefined && SAFE_METHODS.has(method);
  } catch {
    return false;
  }
}

type GetSession = typeof auth.api.getSession;
const getSessionWithCookieCache: GetSession = auth.api.getSession;

auth.api.getSession = (async (ctx: Parameters<GetSession>[0]) => {
  if (await currentRequestIsSafe()) return getSessionWithCookieCache(ctx);
  return getSessionWithCookieCache({
    ...ctx,
    query: { ...(ctx as { query?: Record<string, unknown> }).query, disableCookieCache: true },
  } as Parameters<GetSession>[0]);
}) as GetSession;
