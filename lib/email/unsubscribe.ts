/**
 * One-click unsubscribe tokens for the weekly digest (CAN-SPAM §List-Unsubscribe).
 *
 * A signed, self-contained token that carries the target `userId` plus an
 * issued-at timestamp, HMAC-signed with `BETTER_AUTH_SECRET`. No DB row is
 * needed to look a token up, and it can't be forged without the secret.
 *
 * Uses `node:crypto` — imported ONLY by server modules (digest assembly and the
 * public `/api/email/unsubscribe` route), never from client code.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// Unsubscribe links live in inboxes for a long time; keep them valid well past
// CAN-SPAM's 30-day floor so a click months later still works.
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function secret(): string | null {
  return process.env.BETTER_AUTH_SECRET || null;
}

function sign(userId: string, issuedAt: number, key: string): string {
  return createHmac('sha256', key).update(`digest-unsub\n${userId}\n${issuedAt}`).digest('hex');
}

/**
 * Mint a token for `userId`. Throws if the signing secret is missing (a
 * misconfiguration that must fail loudly rather than emit unverifiable links).
 */
export function signUnsubToken(userId: string, issuedAt = Math.floor(Date.now() / 1000)): string {
  const key = secret();
  if (!key) throw new Error('BETTER_AUTH_SECRET is required to sign unsubscribe tokens');
  return `${userId}.${issuedAt}.${sign(userId, issuedAt, key)}`;
}

/**
 * Verify a token and return its `userId`, or `null` if it is malformed,
 * expired, or the signature doesn't match. Constant-time signature compare.
 */
export function verifyUnsubToken(token: string): string | null {
  const key = secret();
  if (!key || typeof token !== 'string') return null;

  // userId (cuid/uuid — no dots) . issuedAt (digits) . hmac (64 hex). Split from
  // the right so a userId that ever contained a dot wouldn't break parsing.
  const parts = token.split('.');
  if (parts.length < 3) return null;
  const mac = parts[parts.length - 1];
  const issuedAtRaw = parts[parts.length - 2];
  const userId = parts.slice(0, parts.length - 2).join('.');
  if (!userId || !/^\d{1,15}$/.test(issuedAtRaw) || !/^[a-f0-9]{64}$/.test(mac)) return null;

  const issuedAt = Number(issuedAtRaw);
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  // Allow a little clock skew into the future; reject stale tokens.
  if (!Number.isSafeInteger(issuedAt) || age < -300 || age > MAX_AGE_SECONDS) return null;

  const expected = Buffer.from(sign(userId, issuedAt, key), 'hex');
  const supplied = Buffer.from(mac, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return userId;
}
