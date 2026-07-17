/**
 * Wrapper for v1 developer-API route handlers. Handles, in order:
 *   1. A coarse per-IP gate (before auth) so invalid-key floods can't hammer
 *      the DB.
 *   2. API-key authentication + real-time entitlement / ban / expiry checks.
 *   3. Per-key, tier-scaled rate limiting with `X-RateLimit-*` headers on every
 *      response (not just 429s).
 *   4. Per-endpoint scope enforcement.
 *   5. Idempotency-Key replay for writes, so a retried POST/PATCH/DELETE never
 *      acts twice.
 *
 * Every response carries an `X-Request-Id` (also echoed in error bodies as
 * `request_id`) for support + tracing. Handlers receive a context with bound
 * `json`/`error`/`noContent` helpers that bake in all standard headers.
 */

import { randomBytes, createHash } from 'crypto';
import { authenticateApiKey, CORS_HEADERS } from '@/lib/api/developer-auth.server';
import { errorBody, defaultStatus } from '@/lib/api/errors';
import { hasScope } from '@/lib/api/scopes';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { redisRateLimit, redisIncrBy } from '@/lib/redis.server';
import { prisma } from '@/lib/prisma.server';
import type { Tier } from '@/lib/entitlements';

interface LimitResult { allowed: boolean; retryAfter: number; limit: number; remaining: number; reset: number }

/**
 * Cross-instance rate limit when Redis is configured, else the per-instance
 * in-process limiter. Both return { allowed, retryAfter, limit, remaining, reset }.
 */
async function limit(key: string, max: number, windowMs: number): Promise<LimitResult> {
  const viaRedis = await redisRateLimit(key, max, windowMs);
  if (viaRedis) return viaRedis;
  return rateLimit(key, { limit: max, windowMs });
}

/** A short, sortable-ish opaque request id for tracing/support. */
function newRequestId(): string {
  return `req_${randomBytes(12).toString('hex')}`;
}

function rateHeaders(r: LimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
  };
}

export interface ApiContext {
  userId: string;
  tier: Tier;
  keyId: string;
  scopes: string[];
  request: Request;
  requestId: string;
  /** JSON success response with all standard headers applied. */
  json: (data: unknown, status?: number, extraHeaders?: Record<string, string>) => Response;
  /** Standardized error response: `{ error: { type, code, message, request_id } }`. */
  error: (code: string, message: string, status?: number, extraHeaders?: Record<string, string>) => Response;
  /** 204 No Content with standard headers (used by DELETE / toggles). */
  noContent: (extraHeaders?: Record<string, string>) => Response;
}

export interface ApiHandlerOptions {
  /** Scope the key must hold to call this endpoint. Omit for unscoped routes. */
  scope?: string;
  /**
   * When true, honor the `Idempotency-Key` header: replay the first response for
   * a given (key, idempotency-key) and reject the same key with a different body
   * (409). Set on POST/PATCH/DELETE handlers that create or mutate state.
   */
  idempotent?: boolean;
  /**
   * Cost weight (request units) this endpoint charges against the per-key DAILY
   * quota. Defaults to 1. Heavier endpoints should pass a larger value so an
   * expensive call (e.g. an image upload or a fan-out feed read) counts for more
   * than a cheap point-read. The per-minute limiter is unaffected — it still
   * counts one request. Integer ≥ 1.
   */
  cost?: number;
}

// Per-key per-minute request budget. Pro+ gets a higher ceiling than Starter.
const LIMITS: Record<string, number> = { starter: 120, pro: 600, enterprise: 600 };

// Per-key DAILY quota (request units). Programmatic clients get a firm ceiling —
// unlike interactive human traffic, an API key should not be able to run
// unbounded volume forever on a per-minute limit alone. Cost-weighted by the
// `cost` option so heavy endpoints draw down faster. Tunable via env.
const DAILY_LIMITS: Record<string, number> = {
  starter: Number(process.env.DEV_API_DAILY_STARTER) || 20_000,
  pro: Number(process.env.DEV_API_DAILY_PRO) || 200_000,
  enterprise: Number(process.env.DEV_API_DAILY_ENTERPRISE) || 200_000,
};

/** Daily counters live slightly longer than a day so a key crossing midnight
 * never briefly loses its running total before the new day's key takes over. */
const DAILY_TTL_MS = 26 * 60 * 60 * 1000;

/** UTC day bucket, e.g. "20260717" — the daily counter's key suffix. */
function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}
/** Epoch (ms) at the next UTC midnight — when the daily quota resets. */
function utcMidnightMs(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** How long an idempotent response stays replayable. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** CORS preflight response for OPTIONS. */
export function apiOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Build the response helpers bound to a request id + the current rate headers. */
function makeResponder(requestId: string, headers: Record<string, string>) {
  const base = { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...CORS_HEADERS, ...headers };
  return {
    json: (data: unknown, status = 200, extra?: Record<string, string>) =>
      new Response(JSON.stringify(data), { status, headers: { ...base, ...extra } }),
    error: (code: string, message: string, status?: number, extra?: Record<string, string>) =>
      new Response(JSON.stringify(errorBody(code, message, requestId)), {
        status: status ?? defaultStatus(code),
        headers: { ...base, ...extra },
      }),
    noContent: (extra?: Record<string, string>) =>
      new Response(null, { status: 204, headers: { 'X-Request-Id': requestId, ...CORS_HEADERS, ...headers, ...extra } }),
  };
}

export async function withDeveloperApi(
  request: Request,
  handler: (ctx: ApiContext) => Promise<Response>,
  options: ApiHandlerOptions = {}
): Promise<Response> {
  const requestId = newRequestId();

  // Pre-auth responder: request id + CORS, no rate headers yet.
  const pre = makeResponder(requestId, {});

  // 1. Coarse IP gate *before* auth, so invalid-key floods / credential stuffing
  // can't hammer the DB. Valid traffic is governed by the per-key limit below.
  const ipGate = await limit(`dev-api-ip:${getClientIp(request)}`, 300, 60_000);
  if (!ipGate.allowed) {
    return pre.error('rate_limited', 'Too many requests from this address.', 429, { 'Retry-After': String(ipGate.retryAfter) });
  }

  // 2. Authenticate.
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return pre.error(auth.code, auth.message, auth.status);

  // 3. Per-key, tier-scaled per-minute rate limit.
  const max = LIMITS[auth.tier] ?? 120;
  const rl = await limit(`dev-api:apikey:${auth.keyId}`, max, 60_000);
  const minuteHeaders = rateHeaders(rl);
  if (!rl.allowed) {
    return makeResponder(requestId, minuteHeaders).error(
      'rate_limited', 'Too many requests. Slow down.', 429, { 'Retry-After': String(rl.retryAfter) }
    );
  }

  // 3b. Per-key DAILY quota (cost-weighted). Redis-backed so it holds across
  // instances; when Redis is unavailable `redisIncrBy` returns null and we
  // gracefully fall back to the per-minute limit only (same degrade contract as
  // §3). Charged AFTER the per-minute gate so a throttled burst doesn't burn the
  // day's budget. `X-RateLimit-Daily-*` ride on every response, like the minute
  // headers, whenever the counter is live.
  const cost = Math.max(1, Math.floor(options.cost ?? 1));
  const dailyMax = DAILY_LIMITS[auth.tier] ?? DAILY_LIMITS.starter;
  const dailyUsed = await redisIncrBy(`devapi:daily:${auth.keyId}:${utcDayKey()}`, cost, DAILY_TTL_MS);
  const dailyHeaders: Record<string, string> =
    dailyUsed === null
      ? {}
      : {
          'X-RateLimit-Daily-Limit': String(dailyMax),
          'X-RateLimit-Daily-Remaining': String(Math.max(0, dailyMax - dailyUsed)),
          'X-RateLimit-Daily-Reset': String(Math.ceil(utcMidnightMs() / 1000)),
        };
  const headers = { ...minuteHeaders, ...dailyHeaders };
  const res = makeResponder(requestId, headers);
  if (dailyUsed !== null && dailyUsed > dailyMax) {
    const retryAfter = Math.max(1, Math.ceil((utcMidnightMs() - Date.now()) / 1000));
    return res.error(
      'quota_exceeded',
      `Daily quota of ${dailyMax} request units for this API key is exhausted. It resets at 00:00 UTC.`,
      429,
      { 'Retry-After': String(retryAfter) }
    );
  }

  // 4. Scope enforcement.
  if (options.scope && !hasScope(auth.scopes, options.scope)) {
    return res.error(
      'insufficient_scope',
      `This endpoint requires the "${options.scope}" scope, which this key does not have.`,
      403,
      { 'X-Accepted-Scope': options.scope }
    );
  }

  const ctx: ApiContext = {
    userId: auth.userId,
    tier: auth.tier,
    keyId: auth.keyId,
    scopes: auth.scopes,
    request,
    requestId,
    json: res.json,
    error: res.error,
    noContent: res.noContent,
  };

  // 5. Idempotency replay for writes carrying an Idempotency-Key.
  const idemKey = options.idempotent ? request.headers.get('idempotency-key')?.trim() : null;
  let requestHash = '';
  if (idemKey) {
    if (idemKey.length > 255) {
      return res.error('invalid_request', 'Idempotency-Key must be at most 255 characters.', 400);
    }
    const bodyText = await request.clone().text();
    requestHash = createHash('sha256').update(`${request.method}:${new URL(request.url).pathname}:${bodyText}`).digest('hex');

    const prior = await prisma.apiIdempotencyKey
      .findUnique({ where: { keyId_idempotency: { keyId: auth.keyId, idempotency: idemKey } } })
      .catch(() => null);
    if (prior) {
      if (prior.requestHash !== requestHash) {
        return res.error('idempotency_conflict', 'This Idempotency-Key was already used with a different request body.', 409);
      }
      return new Response(prior.responseBody, {
        status: prior.statusCode,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId, 'Idempotency-Replayed': 'true', ...CORS_HEADERS, ...headers },
      });
    }
  }

  // 6. Run the handler.
  let response: Response;
  try {
    response = await handler(ctx);
  } catch (err) {
    console.error(`[dev-api] handler error (req ${requestId}):`, err);
    return res.error('internal_error', 'Something went wrong handling the request.', 500);
  }

  // 7. Persist a successful idempotent response for future replays (best-effort).
  if (idemKey && response.status >= 200 && response.status < 300) {
    try {
      const stored = await response.clone().text();
      await prisma.apiIdempotencyKey.create({
        data: {
          keyId: auth.keyId,
          idempotency: idemKey,
          method: request.method,
          path: new URL(request.url).pathname.slice(0, 255),
          requestHash,
          statusCode: response.status,
          responseBody: stored,
        },
      });
      // Opportunistic sweep of expired rows (cheap, bounded, best-effort).
      prisma.apiIdempotencyKey
        .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } } })
        .catch(() => {});
    } catch (e) {
      // A concurrent request may have stored first (unique violation) — ignore.
      if (!(e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002')) {
        console.error(`[dev-api] idempotency store failed (req ${requestId}):`, e);
      }
    }
  }

  return response;
}
