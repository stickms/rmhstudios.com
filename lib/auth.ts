// NOTE: the reflect-metadata polyfill that the passkey plugin (via tsyringe)
// needs is installed at server startup by the Nitro plugin in
// server/nitro/reflect-metadata.ts — a source-level import here is tree-shaken
// and reordered after the passkey chunk, so it must live in the startup plugin.
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma.server';
import { generateHandle } from '@/lib/handle.server';
import { getStripeClient } from '@/lib/billing/stripe-client.server';
import { stripe } from '@better-auth/stripe';
import { captcha, customSession, emailOTP, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { getUserTier, invalidateUserTier } from '@/lib/entitlements';
import { sendEmail } from '@/lib/email/send.server';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { isPlaceholderEmail } from '@/lib/auth/providers';
import { socialProviderConfig, steamApiKey } from '@/lib/auth/provider-config.server';
import { steam } from '@/lib/auth/steam.server';
import { consolidation } from '@/lib/auth/consolidation.server';
import { notifySignInChange } from '@/lib/auth/security-notice.server';
import { recordSecurityEvent } from '@/lib/auth/security-log.server';
import {
  captureSecurityActor,
  recordSecurityAfter,
  trackSignIn,
} from '@/lib/auth/security-hooks.server';
import { sendExistingAccountNotice } from '@/lib/auth/existing-account-notice.server';
import { startRecoveryHold } from '@/lib/recovery/hold.server';
import {
  RESET_IDENTIFIER_PREFIX,
  RESET_LINK_TTL_SECONDS,
  hashResetIdentifier,
  onResetRequested,
  revokeResetLinks,
} from '@/lib/auth/password-reset.server';
import {
  TWO_FACTOR_DISABLED_PATHS,
  TWO_FACTOR_OPTIONS,
  classifyNewSession,
  completedPasswordSignIn,
  noteTwoFactorVerifier,
} from '@/lib/auth/two-factor.server';
import { assertSignInAllowed, clearSignInFailures, recordSignInFailure } from '@/lib/auth/sign-in-throttle.server';
import { TURNSTILE_ENDPOINTS } from '@/lib/auth/turnstile';
import { turnstileSecretKey } from '@/lib/auth/turnstile.server';
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
const stripeClient = getStripeClient();

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

/** Set once `auth` exists (below): asks the emailOTP plugin to issue and send a verification code. */
let sendVerificationCode: (email: string) => Promise<void> = async () => {};

/**
 * The verification-code email. The code leads the subject and stands alone on its own line in both parts, because that
 * is what lets iOS and macOS Mail, Gmail and the browsers that read them offer it in the code field
 * (`autocomplete="one-time-code"` on the login page) without the person copying it.
 */
function codeEmail(code: string): { subject: string; html: string; text: string } {
  return {
    subject: `${code} is your RMH Studios verification code`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 16px">Enter this code to confirm your address and finish setting up your RMH Studios account. It expires in 10 minutes.</p>
  <p style="font-size:28px;font-weight:600;letter-spacing:0.2em;margin:0 0 16px;font-family:ui-monospace,Menlo,monospace">${code}</p>
  <p style="font-size:12px;color:#666;margin:0">If you did not ask for this, you can ignore this email.</p>
</div>`,
    text: `Your RMH Studios verification code is ${code}\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore this email.`,
  };
}

/**
 * What this site does when someone signs in: the security log row and the new-device alert (B11), and
 * cancelling a scheduled deletion (B12, signing back in is the cancel flow). Called once per real sign-in:
 * from the session-created hook, or, for a password sign-in, once the second factor is settled
 * (`lib/auth/two-factor.server.ts`). Neither may sit in front of the response, and both swallow their errors.
 */
function onSignedIn(session: { id: string; userId: string }, request: Request): void {
  // The security log records the sign-in from the same chain, as `sign_in_new_device` when the alert was
  // sent and `sign_in` otherwise.
  trackSignIn(session, request);
  void import('@/lib/account/deletion.server')
    .then((m) => m.cancelDeletion(session.userId))
    .catch((err) => console.error('[auth] deletion cancel failed:', err));
}

export const auth = betterAuth({
  // The email-OTP plugin brings passwordless sign-in, its own password reset and email change along with the
  // verification code. Only the code is wanted (verification by code, owner 2026-11-19): the rest would be a second
  // way in that the recent-sign-in rule and the account-linking policy below were never written for.
  disabledPaths: [
    '/sign-in/email-otp',
    '/email-otp/request-password-reset',
    '/forget-password/email-otp',
    '/email-otp/reset-password',
    '/email-otp/request-email-change',
    '/email-otp/change-email',
    '/email-otp/check-verification-otp',
    ...TWO_FACTOR_DISABLED_PATHS,
  ],
  baseURL: process.env.BETTER_AUTH_URL,
  // Password-reset tokens are stored hashed (lib/auth/password-reset.server.ts), so a leaked database or backup holds
  // no working reset link. Only that prefix: the other verification rows keep their own storage.
  verification: {
    storeIdentifier: {
      default: 'plain',
      overrides: { [RESET_IDENTIFIER_PREFIX]: { hash: hashResetIdentifier } },
    },
  },
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
      // Each one sends an email. Better Auth renamed `/forget-password` to this; the old key matched nothing.
      '/request-password-reset': { window: 300, max: 3 },
      '/reset-password': { window: 60, max: 10 },
      // Each one sends an email: keep them from being used to flood an inbox.
      '/send-verification-email': { window: 300, max: 3 },
      '/email-otp/send-verification-otp': { window: 300, max: 3 },
      // A wrong code also spends one of the code's own attempts (allowedAttempts below).
      '/email-otp/verify-email': { window: 300, max: 10 },
      '/change-email': { window: 300, max: 5 },
      '/link-social': { window: 60, max: 10 },
      '/unlink-account': { window: 60, max: 10 },
      // Each checks the current password. Per account the two-factor plugin also locks code entry after 10
      // wrong codes; per address, wrong passwords lock sign-in (lib/auth/sign-in-throttle.server.ts).
      '/change-password': { window: 60, max: 5 },
      '/two-factor/*': { window: 60, max: 10 },
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
    // A sign-up with an address that already has an account gets the same
    // "Check your inbox" answer as a new one (no enumeration), so tell the
    // address's owner how they actually sign in. Not awaited: an email send
    // must not make an existing address answer slower than a new one.
    onExistingUserSignUp: async ({ user }) => {
      void sendExistingAccountNotice(user);
    },
    // A reset signs the account out everywhere: whoever had the old password, or a stolen session, is cut off.
    revokeSessionsOnPasswordReset: true,
    // One hour, as the login page and the email say. A link works once (Better Auth consumes it atomically).
    resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
    // A reset by email is how an account is recovered, so it starts the 72-hour economy hold (no tips, gifts or
    // redemptions) and tells the inbox it happened. Neither may fail the reset itself.
    // Also logged for the member (their security log, "Not you?"). Only the account and the request's device and
    // network are stored: never the token. The record never throws and is not awaited.
    onPasswordReset: async ({ user }, request) => {
      void recordSecurityEvent({ userId: user.id, kind: 'password_reset_completed', request });
      // Any other link still outstanding for the account stops working too, and the inbox owner is no longer
      // held behind someone else's wrong passwords.
      await revokeResetLinks(user.id);
      void clearSignInFailures(user.email);
      await startRecoveryHold(user.id, 'password reset by email').catch((err) =>
        console.error('[auth] recovery hold failed:', err),
      );
      void sendEmail({
        to: user.email,
        subject: 'Your RMH Studios password was changed',
        html: emailShell(
          'Your password was changed',
          'The password for your RMH Studios account was just reset, and every device was signed out. Coin transfers and redemptions are paused for 72 hours as a precaution. If this was not you, reset it again now and review your security settings.',
          { label: 'Review security settings', url: `${process.env.BETTER_AUTH_URL?.replace(/\/$/, '') ?? ''}/settings/security` },
        ),
        text: 'The password for your RMH Studios account was just reset. If this was not you, reset it again now and review your security settings.',
      });
    },
    // The reset email goes through Resend (`sendEmail`). Better Auth calls this only for an address that has an
    // account, so `onResetRequested` returns at once and works in the background: waiting on it would make a real
    // address answer slower than an unknown one and give it away. It decides whether this account may be sent a
    // link at all, holds the account to an hourly allowance whatever the number of IPs asking, revokes the earlier
    // links, logs the request for the member (never the URL or token) and sends.
    sendResetPassword: async (data, request) => {
      onResetRequested(data, request);
    },
  },
  emailVerification: {
    sendOnSignUp: emailConfigured,
    // Signing in before confirming sends a fresh code (the old one may have
    // expired), and the login page asks for it. Rate-limited with /sign-in/email.
    sendOnSignIn: emailConfigured,
    autoSignInAfterVerification: true,
    // Confirming the account's own address is a six-digit code (owner, 2026-11-19), sent through the emailOTP plugin
    // below. The one link left is the email-change one: Better Auth sends it to the NEW address, which no account
    // holds yet, so a code typed for it could never be matched; that message keeps its link.
    // Not awaited: a new address must answer sign-up as fast as an existing one (which sends nothing, or the
    // background notice above), or the delay of this send would reveal which addresses are new.
    sendVerificationEmail: async ({ user, url }) => {
      void (async () => {
        const owner = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
        if (owner?.id === user.id) {
          await sendVerificationCode(user.email);
          return;
        }
        await sendEmail({
          to: user.email,
          subject: 'Confirm your new RMH Studios email',
          html: emailShell('Confirm your new email', 'Confirm this address to finish changing the email on your RMH Studios account.', {
            label: 'Confirm email',
            url,
          }),
          text: `Confirm your new RMH Studios email: ${url}`,
        });
      })().catch((err) => console.error('[auth] verification email failed:', err));
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
      // Security log: remember who is acting before sign-out / revoke deletes the session.
      await captureSecurityActor(ctx);
      await noteTwoFactorVerifier(ctx);
      // Per-address limit on wrong passwords, whatever the number of IPs guessing.
      if (ctx.path === '/sign-in/email') await assertSignInAllowed((ctx.body as { email?: unknown } | undefined)?.email);
      if (ctx.path !== '/sign-up/email' && ctx.path !== '/change-email') return;
      const body = ctx.body as { email?: unknown; newEmail?: unknown } | undefined;
      const claimed = ctx.path === '/sign-up/email' ? body?.email : body?.newEmail;
      if (typeof claimed === 'string' && isPlaceholderEmail(claimed)) {
        throw new APIError('BAD_REQUEST', { message: 'Enter a valid email address.' });
      }
    }),
    // Security log: passkeys, sessions, sign-out, password and email changes, once they have succeeded.
    after: createAuthMiddleware(async (ctx) => {
      await recordSecurityAfter(ctx);
      if (ctx.path === '/sign-in/email') {
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        const returned = (ctx.context as { returned?: unknown }).returned;
        // Only a wrong password counts against the address (not an unconfirmed email or a refusal).
        if ((returned as { body?: { code?: unknown } } | undefined)?.body?.code === 'INVALID_EMAIL_OR_PASSWORD') {
          void recordSignInFailure(email);
        } else if (!(returned instanceof Error)) {
          void clearSignInFailures(email);
          const session = await completedPasswordSignIn(ctx);
          if (session && ctx.request) onSignedIn(session, ctx.request);
        }
      }
      // A password changed from Settings retires any reset link still outstanding for the account.
      if (ctx.path === '/change-password' && !((ctx.context as { returned?: unknown }).returned instanceof Error)) {
        const userId = ctx.context.session?.user.id;
        if (userId) void revokeResetLinks(userId);
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
          void recordSecurityEvent({
            userId: account.userId,
            kind: 'method_connected',
            detail: { providerId: account.providerId },
          });
        },
      },
      delete: {
        after: async (account) => {
          void notifySignInChange(account.userId, { kind: 'removed', providerId: account.providerId });
          void recordSecurityEvent({
            userId: account.userId,
            kind: 'method_removed',
            detail: { providerId: account.providerId },
          });
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
          // A password sign-in waits for the two-factor plugin (the after-hook above runs it), and enabling or
          // disabling 2FA replaces the session without anyone signing in.
          if (classifyNewSession(ctx?.path, request) !== 'sign-in') return;
          onSignedIn(session, request);
        },
      },
    },
  },
  plugins: [
    // Email verification by six-digit code instead of a link (owner, 2026-11-19). Hashed at rest, ten minutes, five
    // tries; a code is only ever sent for verification (the other kinds are disabled in `disabledPaths`, and this
    // refuses them too). Not awaited, for the same timing reason as the reset email above.
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      disableSignUp: true,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== 'email-verification') return;
        void sendEmail({ to: email, ...codeEmail(otp) });
      },
    }),
    // Steam sign-in (OpenID 2.0, so a plugin rather than a socialProviders
    // entry). Always registered so the plugin tuple keeps its type; its
    // endpoints answer 404 unless STEAM_API_KEY is set.
    steam({ apiKey: steamApiKey }),
    // Recent-sign-in rule and the empty-account merge (account-merge/*).
    consolidation(),
    // Optional two-step verification: an authenticator app plus ten backup codes, for email-and-password
    // sign-in (lib/auth/two-factor.server.ts). Never required.
    twoFactor(TWO_FACTOR_OPTIONS),
    // Cloudflare Turnstile in front of the two endpoints a bot uses to make accounts or send email, only when a
    // secret is configured (lib/auth/turnstile.ts). Sign-in is guarded by the per-address limit instead.
    ...(turnstileSecretKey() ? [captcha({ provider: 'cloudflare-turnstile', secretKey: turnstileSecretKey()!, endpoints: [...TURNSTILE_ENDPOINTS] })] : []),
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

sendVerificationCode = async (email) => {
  await auth.api.sendVerificationOTP({ body: { email, type: 'email-verification' } });
};

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
