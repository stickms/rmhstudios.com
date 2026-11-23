/**
 * Two-step verification: an authenticator-app code (TOTP) after the password, with ten single-use
 * backup codes. Optional for every account (owner, 2026-11-23): offered once after an email sign-up and
 * in Settings → Security, never required. It gates email-and-password sign-in only; a passkey is already
 * two factors, and Discord, GitHub and the other providers carry their own.
 *
 * Better Auth's `twoFactor` plugin does the work: the secret and backup codes are encrypted with
 * BETTER_AUTH_SECRET, a correct password with 2FA on deletes the session it just made and answers
 * `{ twoFactorRedirect: true }` instead, five wrong codes end that challenge, ten in a row lock code entry
 * for the account for 15 minutes, and "trust this device" skips the code on that browser for 30 days.
 *
 * What this module adds is the part the plugin cannot know: this site does things when someone signs in
 * (the security log row, the new-device alert, cancelling a scheduled deletion; `onSignedIn` in
 * `lib/auth.ts`), and those must wait for the second factor. A password alone is not a sign-in when 2FA
 * is on, and enabling or disabling 2FA replaces the session without anyone signing in.
 */
import type { createAuthMiddleware } from 'better-auth/api';

type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** Options for Better Auth's `twoFactor()` plugin. */
export const TWO_FACTOR_OPTIONS = {
  issuer: 'RMH Studios',
  backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: 'encrypted' as const },
  /** "Trust this device": 30 days. */
  trustDeviceMaxAge: 30 * 24 * 60 * 60,
  /** How long the code step waits after a correct password. */
  twoFactorCookieMaxAge: 10 * 60,
  accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
};

/** The email codes the plugin can also send are not used: an authenticator app or a backup code only. */
export const TWO_FACTOR_DISABLED_PATHS = ['/two-factor/send-otp', '/two-factor/verify-otp'] as const;

/** The sign-in the plugin can stop for a second factor. */
export const PASSWORD_SIGN_IN_PATH = '/sign-in/email';
/** Endpoints that finish a sign-in that stopped for a code, or confirm setup when signed in. */
export const TWO_FACTOR_VERIFY_PATHS: ReadonlySet<string> = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);
/** Endpoints that replace the current session with a new one for the same person: not a sign-in. */
const SESSION_ROTATION_PATHS: ReadonlySet<string> = new Set(['/two-factor/enable', '/two-factor/disable']);

/** Verify requests made by someone already signed in (setting up 2FA, not signing in). */
const signedInVerifies = new WeakSet<Request>();

/**
 * `hooks.before`: remember whether a verify request came from a signed-in session. Only then is it setup;
 * without one it is the second step of a sign-in. Never throws.
 */
export async function noteTwoFactorVerifier(ctx: AuthHookContext): Promise<void> {
  try {
    if (!ctx.request || !TWO_FACTOR_VERIFY_PATHS.has(ctx.path)) return;
    const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
    if (token && (await ctx.context.internalAdapter.findSession(token))) signedInVerifies.add(ctx.request);
  } catch (err) {
    console.error('[auth] two-factor verifier check failed:', err);
  }
}

/**
 * `databaseHooks.session.create.after`: what a new session means.
 *  - `sign-in`: someone signed in; run the sign-in side effects now.
 *  - `deferred`: a password sign-in; `completedPasswordSignIn` decides once the plugin has (it may still
 *    want a code, and then this session is about to be deleted).
 *  - `not-a-sign-in`: the same person's session was replaced.
 */
export function classifyNewSession(
  path: string | undefined,
  request: Request | undefined,
): 'sign-in' | 'deferred' | 'not-a-sign-in' {
  if (path === PASSWORD_SIGN_IN_PATH) return 'deferred';
  if (path && SESSION_ROTATION_PATHS.has(path)) return 'not-a-sign-in';
  if (path && TWO_FACTOR_VERIFY_PATHS.has(path) && request && signedInVerifies.has(request)) return 'not-a-sign-in';
  return 'sign-in';
}

interface TwoFactorPlugin {
  shouldRequireTwoFactor?: (ctx: AuthHookContext) => Promise<boolean>;
}

/**
 * `hooks.after` on a password sign-in: the session that sign-in really produced, or null when it failed or
 * is waiting for a code. The site's own after-hooks run before the plugin's, so the session still exists
 * here; the plugin's own check answers whether it is about to be replaced by a code step (it also honours
 * a trusted-device cookie, and its answer is memoised for the request, so the plugin reuses it).
 */
export async function completedPasswordSignIn(
  ctx: AuthHookContext,
): Promise<{ id: string; userId: string } | null> {
  if (ctx.path !== PASSWORD_SIGN_IN_PATH) return null;
  const created = ctx.context.newSession as
    | { session: { id: string; userId: string }; user: { twoFactorEnabled?: boolean | null } }
    | null
    | undefined;
  if (!created) return null;
  if (created.user.twoFactorEnabled) {
    const plugin = ctx.context.getPlugin('two-factor') as TwoFactorPlugin | null | undefined;
    // Fail closed on the side effects: if the plugin cannot say, the code step decides and the verify
    // endpoint's own session will count as the sign-in.
    if (!plugin?.shouldRequireTwoFactor || (await plugin.shouldRequireTwoFactor(ctx))) return null;
  }
  return created.session;
}
