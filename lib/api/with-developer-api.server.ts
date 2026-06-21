/**
 * Thin wrapper for v1 developer-API route handlers: authenticates the API key,
 * enforces a per-key rate limit, and standardizes errors. Keeps each endpoint
 * focused on its own logic.
 */

import { authenticateApiKey, apiError, apiJson, CORS_HEADERS } from '@/lib/api/developer-auth.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { Tier } from '@/lib/entitlements';

export interface ApiContext {
  userId: string;
  tier: Tier;
  request: Request;
}

// Per-key request budget. Pro+ gets a higher ceiling than Starter.
const LIMITS: Record<string, number> = { starter: 120, pro: 600, enterprise: 600 };

/** CORS preflight response for OPTIONS. */
export function apiOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function withDeveloperApi(
  request: Request,
  handler: (ctx: ApiContext) => Promise<Response>
): Promise<Response> {
  // Coarse IP gate *before* auth, so invalid-key floods / credential stuffing
  // can't hammer the DB. Valid traffic is governed by the per-key limit below.
  const ipGate = rateLimit(getClientIp(request), { limit: 300, windowMs: 60_000, prefix: 'dev-api-ip' });
  if (!ipGate.allowed) {
    return apiError('rate_limited', 'Too many requests from this address.', 429, {
      'Retry-After': String(ipGate.retryAfter),
    });
  }

  const auth = await authenticateApiKey(request);
  if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

  const limit = LIMITS[auth.tier] ?? 120;
  const { allowed, retryAfter } = rateLimit(`apikey:${auth.keyId}`, {
    limit,
    windowMs: 60_000,
    prefix: 'dev-api',
  });
  if (!allowed) {
    return apiError('rate_limited', 'Too many requests. Slow down.', 429, {
      'Retry-After': String(retryAfter),
      'X-RateLimit-Limit': String(limit),
    });
  }

  try {
    return await handler({ userId: auth.userId, tier: auth.tier, request });
  } catch (err) {
    console.error('[dev-api] handler error:', err);
    return apiError('internal_error', 'Something went wrong handling the request.', 500);
  }
}

export { apiJson, apiError };
