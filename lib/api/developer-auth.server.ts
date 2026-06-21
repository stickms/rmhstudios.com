/**
 * Developer API authentication + helpers (subscriber-gated REST API).
 *
 * Security model:
 *  - Keys are random 256-bit tokens, formatted `rmh_live_<base62>`.
 *  - Only the SHA-256 hash is stored; the plaintext is shown once at creation.
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

/** Generate a new plaintext key + its storage hash + a short display prefix. */
export function generateApiKey(): { plaintext: string; hashedKey: string; prefix: string } {
  const secret = randomBytes(24).toString('base64url'); // ~32 url-safe chars
  const plaintext = `${KEY_PREFIX}${secret}`;
  return { plaintext, hashedKey: hashApiKey(plaintext), prefix: plaintext.slice(0, 14) };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export interface ApiAuthSuccess {
  ok: true;
  userId: string;
  tier: Tier;
  keyId: string;
}
export interface ApiAuthFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

/** Stable JSON error envelope for the developer API. */
export function apiError(code: string, message: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(extraHeaders ?? {}) },
  });
}

/** Stable JSON success envelope for the developer API. */
export function apiJson(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(extraHeaders ?? {}) },
  });
}

// The v1 API is safe to call from browsers (read + scoped writes), so allow
// permissive CORS. Auth is via the bearer key, never cookies, so this is not a
// CSRF surface.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key',
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
 * Resolve and authorize a developer API request. Returns the owner + tier on
 * success, or a structured failure (caller turns it into a Response).
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
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!record || record.revokedAt) {
    return { ok: false, status: 401, code: 'invalid_key', message: 'API key is invalid or has been revoked.' };
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

  return { ok: true, userId: record.userId, tier, keyId: record.id };
}
