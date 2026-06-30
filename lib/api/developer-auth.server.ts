/**
 * Developer API authentication + helpers (subscriber-gated REST API).
 *
 * Security model:
 *  - Keys are random 256-bit tokens, formatted `rmh_live_<base62>`.
 *  - Only the SHA-256 hash is stored; the plaintext is shown once at creation.
 *    A 4-char display suffix (`lastFour`) is stored so a user can tell keys
 *    apart in the dashboard without the secret ever being recoverable.
 *  - Keys carry granular scopes; an expired or revoked key is rejected.
 *  - Every request re-resolves the owner's subscription tier, so access is
 *    revoked immediately when a subscription lapses (not just at key creation).
 *  - Banned users are rejected.
 *  - All failures return a stable error envelope and never leak internals.
 */

import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma.server';
import { getUserTier, hasApiAccess, type Tier } from '@/lib/entitlements';
import { getActiveBan } from '@/lib/admin-audit.server';

export const KEY_PREFIX = 'rmh_live_';

/** Generate a new plaintext key + its storage hash + display prefix/suffix. */
export function generateApiKey(): { plaintext: string; hashedKey: string; prefix: string; lastFour: string } {
  const secret = randomBytes(24).toString('base64url'); // ~32 url-safe chars
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    hashedKey: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 14),
    lastFour: plaintext.slice(-4),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export interface ApiAuthSuccess {
  ok: true;
  userId: string;
  tier: Tier;
  keyId: string;
  scopes: string[];
}
export interface ApiAuthFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

// The v1 API is safe to call from browsers (read + scoped writes), so allow
// permissive CORS. Auth is via the bearer key, never cookies, so this is not a
// CSRF surface.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key, Idempotency-Key',
  'Access-Control-Expose-Headers': 'X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
  'Access-Control-Max-Age': '86400',
};

function extractKey(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerKey = request.headers.get('x-api-key');
  if (headerKey) return headerKey.trim();
  return null;
}

/**
 * Resolve and authorize a developer API request. Returns the owner + tier +
 * scopes on success, or a structured failure (caller turns it into a Response).
 */
export async function authenticateApiKey(request: Request): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const plaintext = extractKey(request);
  if (!plaintext) {
    return { ok: false, status: 401, code: 'missing_key', message: 'Provide an API key via the Authorization: Bearer header.' };
  }
  if (!plaintext.startsWith(KEY_PREFIX)) {
    return { ok: false, status: 401, code: 'invalid_key', message: 'Malformed API key.' };
  }

  const record = await prisma.developerApiKey.findUnique({
    where: { hashedKey: hashApiKey(plaintext) },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true, scopes: true },
  });
  if (!record || record.revokedAt) {
    return { ok: false, status: 401, code: 'invalid_key', message: 'API key is invalid or has been revoked.' };
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 401, code: 'key_expired', message: 'This API key has expired. Create a new one.' };
  }

  // Re-check entitlement on every request so lapsed subscriptions lose access.
  const tier = await getUserTier(record.userId);
  if (!hasApiAccess(tier)) {
    return { ok: false, status: 403, code: 'subscription_required', message: 'The developer API requires an active Starter subscription or higher.' };
  }

  const ban = await getActiveBan(record.userId);
  if (ban) {
    return { ok: false, status: 403, code: 'account_suspended', message: 'This account is suspended.' };
  }

  // Best-effort last-used stamp.
  prisma.developerApiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true, userId: record.userId, tier, keyId: record.id, scopes: record.scopes };
}
