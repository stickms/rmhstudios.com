/**
 * Forgotten-password reset: the policy Better Auth's `emailAndPassword` options call into (`lib/auth.ts`).
 *
 * Better Auth owns the mechanics: `/request-password-reset` stores a 24-character random token as a
 * `verification` row (`reset-password:<token>`, value = the user id) and hands us the link to mail;
 * `/reset-password/:token` checks it and sends the browser to `/reset-password?token=`; `/reset-password`
 * consumes the row atomically, sets the password and signs every session out. What it leaves to us,
 * and this module does:
 *
 *  - **Tokens are hashed at rest.** `hashResetIdentifier` is wired as Better Auth's
 *    `verification.storeIdentifier` override for the `reset-password:` prefix, so a leaked database
 *    or backup holds no working link. The `reset-password:` prefix is kept on the hash so the rows of
 *    one account can still be found (`revokeResetLinks`). Better Auth falls back to the plain
 *    identifier on lookup, so a link mailed before this shipped keeps working until it expires.
 *  - **Only the newest link works.** Issuing a link revokes the account's earlier ones, and a
 *    completed reset or a password change revokes them all.
 *  - **One account cannot be mailed without bound.** Better Auth's limit on the endpoint is per IP;
 *    `RESET_EMAILS_PER_HOUR` caps the emails one account receives, whatever the number of IPs asking.
 *  - **A link goes only where it proves something.** An account with a password, or one whose address
 *    is confirmed, gets the link. An account with no password whose address was never confirmed (a
 *    provider passed it on unverified) does not: a reset would ADD a password, handing the account to
 *    whoever owns that inbox. Placeholder addresses never get one either.
 *
 * Nothing here may make an existing address answer slower than an unknown one, so `onResetRequested`
 * returns at once and does its work in the background, and nothing here throws.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { sendEmail } from '@/lib/email/send.server';
import { rateLimit } from '@/lib/rate-limit';
import { redisRateLimit } from '@/lib/redis.server';
import { recordSecurityEvent } from '@/lib/auth/security-log.server';
import { CREDENTIAL_PROVIDER_ID, isPlaceholderEmail } from '@/lib/auth/providers';

/** Better Auth's identifier prefix for a reset token (`reset-password:<token>`). */
export const RESET_IDENTIFIER_PREFIX = 'reset-password:';

/** How long a reset link works. The login page and the email both say "an hour". */
export const RESET_LINK_TTL_SECONDS = 60 * 60;

/** Reset emails one account may receive per hour, across every IP that asks. */
export const RESET_EMAILS_PER_HOUR = 5;
const RESET_THROTTLE_WINDOW_MS = 60 * 60 * 1000;

/**
 * The stored form of a reset identifier: the prefix, then the SHA-256 of the whole identifier
 * (base64url). Deterministic, so Better Auth can look a token up by hashing what the link carries.
 */
export async function hashResetIdentifier(identifier: string): Promise<string> {
  return RESET_IDENTIFIER_PREFIX + createHash('sha256').update(identifier).digest('base64url');
}

/**
 * Revoke the account's outstanding reset links, except the one stored as `keep` (a hashed identifier).
 * Returns how many were revoked; never throws.
 */
export async function revokeResetLinks(userId: string, keep?: string): Promise<number> {
  try {
    const { count } = await prisma.verification.deleteMany({
      where: {
        value: userId,
        identifier: {
          startsWith: RESET_IDENTIFIER_PREFIX,
          ...(keep ? { not: keep } : {}),
        },
      },
    });
    return count;
  } catch (err) {
    console.error('[auth] could not revoke reset links:', err);
    return 0;
  }
}

/**
 * Whether this account may be sent a reset link at all (see the module comment). An account with a
 * password always may: its address may be unconfirmed only because it was pre-registered by someone
 * else, and the real inbox owner resetting it is exactly the recovery that should work.
 */
export async function mayReceiveResetLink(user: { id: string; email: string; emailVerified?: boolean }): Promise<boolean> {
  if (isPlaceholderEmail(user.email)) return false;
  if (user.emailVerified) return true;
  const credential = await prisma.account.findFirst({
    where: {
      userId: user.id,
      providerId: CREDENTIAL_PROVIDER_ID,
    },
    select: {
      id: true,
    },
  });
  return credential != null;
}

/** Count one reset email against the account's hourly allowance. Shared across processes when Redis is up. */
export async function takeResetAllowance(userId: string): Promise<boolean> {
  const key = `pw-reset:${userId}`;
  const shared = await redisRateLimit(key, RESET_EMAILS_PER_HOUR, RESET_THROTTLE_WINDOW_MS);
  if (shared) return shared.allowed;
  return rateLimit(userId, {
    prefix: 'pw-reset',
    limit: RESET_EMAILS_PER_HOUR,
    windowMs: RESET_THROTTLE_WINDOW_MS,
    applyMultiplier: false,
  }).allowed;
}

/** Minimal branded transactional-email shell (inline styles: email clients strip <style>). */
function resetEmail(url: string): { subject: string; html: string; text: string } {
  const safeUrl = url.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return {
    subject: 'Reset your RMH Studios password',
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
  <p style="font-size:14px;line-height:1.5;margin:0 0 20px">We received a request to reset the password for your RMH Studios account. This link works once and expires in one hour. Any earlier reset link no longer works.</p>
  <a href="${safeUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Reset password</a>
  <p style="font-size:12px;color:#666;margin:20px 0 0;word-break:break-all">Or paste this link into your browser: ${safeUrl}</p>
  <p style="font-size:12px;color:#666;margin:12px 0 0">If you did not ask for this, ignore this email. Your password stays the same, and nobody can change it without this link.</p>
</div>`,
    text: `Reset your RMH Studios password: ${url}\n\nThis link works once and expires in one hour. If you did not ask for this, ignore this email. Your password stays the same.`,
  };
}

/**
 * `emailAndPassword.sendResetPassword`. Better Auth calls it only for an address that has an account,
 * after it stored the token. Returns at once (see the module comment); the background work decides
 * whether the link is sent, and if not, deletes the token it was handed so it never works.
 */
export function onResetRequested(
  data: { user: { id: string; email: string; emailVerified?: boolean }; url: string; token: string },
  request: Request | undefined,
): void {
  const { user, url, token } = data;
  void (async () => {
    const stored = await hashResetIdentifier(RESET_IDENTIFIER_PREFIX + token);
    if (!(await mayReceiveResetLink(user)) || !(await takeResetAllowance(user.id))) {
      await prisma.verification.deleteMany({ where: { identifier: stored } });
      return;
    }
    await revokeResetLinks(user.id, stored);
    // Logged for the member (their security log, "Not you?"): the account and the request's device and
    // network only, never the URL or token.
    void recordSecurityEvent({ userId: user.id, kind: 'password_reset_requested', request: request ?? null });
    await sendEmail({ to: user.email, ...resetEmail(url) });
  })().catch((err) => console.error('[auth] password reset request failed:', err));
}
