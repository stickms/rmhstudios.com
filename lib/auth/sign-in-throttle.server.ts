/**
 * Per-account limit on wrong passwords. Better Auth's limit on `/sign-in/email` is per IP (10 a minute),
 * so guesses spread over many IPs at one account were never slowed. This counts wrong passwords per
 * address: after `MAX_FAILURES` in `WINDOW_MS`, password sign-in for that address is refused until the
 * window ends. Passkeys, the other providers and "Forgot password?" keep working, and a completed reset
 * clears the count, so the owner is never stuck behind someone else's guessing.
 *
 * Keyed by the address as typed (trimmed, lowercased), whether or not an account has it, so the refusal
 * says nothing about who is signed up: an unknown address locks exactly like a real one. Shared across
 * processes through Redis when it is up; otherwise each process counts on its own (`lruL1`), which still
 * bounds one process's share of an attack.
 *
 * The second factor has its own lock (10 wrong codes, 15 minutes) in Better Auth's twoFactor plugin.
 */
import { createHash } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { lruL1 } from '@/lib/cached.server';
import { redisGetDel, redisIncrBy } from '@/lib/redis.server';

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * In-process on purpose when Redis is down (`lruL1`, not `cached`): a counter that must change on every
 * wrong password cannot wait on a broadcast, and a per-process count still slows an attack.
 */
const local = lruL1('sign-in-failures', { maxEntries: 20_000 });

interface LocalCount {
  count: number;
  until: number;
}

/** The key for an address. Hashed so the store never holds the address itself. */
export function throttleKey(email: string): string {
  return `sign-in-fail:${createHash('sha256').update(email.trim().toLowerCase()).digest('base64url')}`;
}

/**
 * The address's count. Redis first, on its state plane: `INCRBY 0` reads the counter on the same
 * connection the increments use (the cache plane may be another server). Null from Redis means it is off.
 */
async function failures(key: string): Promise<number> {
  const shared = await redisIncrBy(key, 0, WINDOW_MS);
  if (shared !== null) return shared;
  return local.get<LocalCount>(key)?.count ?? 0;
}

/** `hooks.before` on `/sign-in/email`: refuse while the address is locked. */
export async function assertSignInAllowed(email: unknown): Promise<void> {
  if (typeof email !== 'string' || !email) return;
  if ((await failures(throttleKey(email))) < MAX_FAILURES) return;
  throw new APIError('TOO_MANY_REQUESTS', {
    message:
      'Too many wrong passwords for this account. Try again in 15 minutes, sign in another way, or reset your password.',
    code: 'SIGN_IN_LOCKED',
  });
}

/** `hooks.after` on a wrong password. Never throws. */
export async function recordSignInFailure(email: unknown): Promise<void> {
  if (typeof email !== 'string' || !email) return;
  try {
    const key = throttleKey(email);
    const shared = await redisIncrBy(key, 1, WINDOW_MS);
    if (shared !== null) return;
    const now = Date.now();
    const entry = local.get<LocalCount>(key);
    const next: LocalCount = entry ? { count: entry.count + 1, until: entry.until } : { count: 1, until: now + WINDOW_MS };
    local.set(key, next, Math.max(1, next.until - now));
  } catch (err) {
    console.error('[auth] sign-in failure count failed:', err);
  }
}

/** A correct password, or a completed reset, clears the address's count. Never throws. */
export async function clearSignInFailures(email: unknown): Promise<void> {
  if (typeof email !== 'string' || !email) return;
  try {
    const key = throttleKey(email);
    local.delete(key);
    await redisGetDel(key);
  } catch (err) {
    console.error('[auth] sign-in failure reset failed:', err);
  }
}
