/**
 * The one wrapper for **site** API route handlers (`app/routes/api/**`).
 *
 * Every site route repeated the same four-step preamble by hand — session
 * check, rate limit, JSON+zod validation, try/catch — roughly 25–40 lines of
 * ceremony per handler across ~465 route files. Hand-rolling it 576 times is
 * not just volume: it is 576 chances to get the *order* wrong, forget the
 * `Retry-After` header, leak an exception message to the client, or skip
 * validation entirely. This module encodes the order documented in
 * `CLAUDE.md` §3 exactly once:
 *
 *   1. session  (`auth.api.getSession`)        → 401 / 403
 *   2. rate limit (`withRateLimit`, per-IP)    → 429 + `Retry-After`
 *   3. zod `safeParse` of body and/or query    → 400
 *   4. handler, wrapped in try/catch           → 500 (never leaks internals)
 *   5. cache headers + weak `ETag`/`304`       → only on a successful GET/HEAD
 *
 * Response bodies are byte-identical to what the hand-rolled routes returned
 * (`{ error: 'Unauthorized' }`, `{ error: 'Too many requests' }`, …) so this is
 * a pure de-duplication: no client contract changes.
 *
 * The developer API (`/api/v1/**`) keeps its own richer wrapper —
 * `withDeveloperApi` — because it speaks a different error envelope
 * (`{ error: { type, code, message, request_id } }`), API-key auth, scopes,
 * idempotency and quota. Do not use this module there.
 *
 * ```ts
 * export const Route = createFileRoute('/api/widgets')({
 *   server: {
 *     handlers: {
 *       GET: defineHandler({ auth: 'optional' }, async ({ userId }) =>
 *         Response.json(await listWidgets(userId)),
 *       ),
 *       POST: defineHandler(
 *         { rateLimit: 'write', body: z.object({ name: z.string().max(80) }) },
 *         async ({ userId, body }) => Response.json(await create(userId, body.name)),
 *       ),
 *     },
 *   },
 * });
 * ```
 */

import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import type { RateLimitPolicy, WithRateLimitOptions } from '@/lib/rate-limit';
import { withRateLimitAsync } from '@/lib/rate-limit.server';
import { canUse, upgradeRequiredBody, type MemberFeature } from '@/lib/entitlements/features';
import { isAppError } from '@/lib/errors/codes';

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The session shape Better Auth returns, narrowed to the fields site routes
 * actually read. `isAdmin` is an additional-field on the user record, which is
 * why 54 call sites were casting `session.user as { isAdmin?: boolean }` — that
 * cast now lives here, once.
 */
export type ApiSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export type ApiUser = NonNullable<ApiSession>['user'] & {
  isAdmin?: boolean;
  username?: string | null;
};

/** How a route treats an unauthenticated caller. */
export type AuthMode =
  /** Signed-in required; anonymous callers get 401. The default. */
  | 'required'
  /** Signed-in **and** `isAdmin`; anonymous → 401, non-admin → 403. */
  | 'admin'
  /** Session is resolved and passed through, but anonymous callers proceed. */
  | 'optional'
  /** No session lookup at all (public/static endpoints). */
  | 'none';

/** `userId` is only non-null when the route demanded a session. */
type UserIdFor<A extends AuthMode> = A extends 'required' | 'admin' ? string : string | null;
type SessionFor<A extends AuthMode> = A extends 'required' | 'admin'
  ? NonNullable<ApiSession>
  : ApiSession;

/* -------------------------------------------------------------------------- */
/* Options + context                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Rate-limit configuration. Either a named policy from `RATE_LIMIT_POLICIES`
 * (`'read' | 'write' | 'ai' | 'upload' | 'auth'`) or an explicit override for
 * the routes whose historical limit does not fit a bucket. `scope: 'user'`
 * makes the bucket per-user-per-IP instead of per-IP.
 */
export type RateLimitSpec =
  | RateLimitPolicy
  | (Omit<WithRateLimitOptions, 'scope'> & {
      policy?: RateLimitPolicy;
      /** `'user'` keys the bucket by user id + IP; `'ip'` (default) by IP alone. */
      scope?: 'ip' | 'user';
    });

/* -------------------------------------------------------------------------- */
/* HTTP caching                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Declarative response caching. Omitted → the historical behaviour: no
 * `Cache-Control`, no `Vary`, no `ETag`, i.e. uncacheable at every layer.
 *
 * `visibility` is the safety-critical field and deliberately has **no default**:
 * a handler must SAY whether its response is per-user. `'private'` responses are
 * never stored by a shared cache; `'public'` responses must be byte-identical
 * for every caller, which in practice means `auth: 'none'` — or `'optional'`
 * with genuinely no user-dependent branch anywhere in the handler.
 *
 * The `'public'` + authenticated combination is not merely discouraged, it is
 * rejected at module load (see {@link assertCacheSpec}), because the failure
 * mode is one user's response being served to another from the CDN.
 *
 * A declaration is authoritative: when a route declares `cache`, the wrapper
 * writes `Cache-Control` and `Vary` on every successful GET/HEAD response,
 * replacing anything the handler set. That is the point — one policy per route,
 * in one place. A route whose policy varies per response should not declare a
 * static spec at all and should set the headers itself.
 */
export interface CacheSpec {
  /**
   * `'public'` → any cache (browser, CDN, proxy) may store and SHARE it.
   * `'private'` → the caller's own browser only.
   */
  visibility: 'public' | 'private';
  /** Browser freshness, seconds. */
  maxAge: number;
  /** Shared-cache (CDN) freshness, seconds. Ignored when visibility is private. */
  sMaxAge?: number;
  /**
   * Serve-stale window while revalidating, seconds.
   *
   * Note what this buys the caller and costs the reader: a client can see data
   * up to `sMaxAge + staleWhileRevalidate` old. Anything a user can change and
   * then immediately expects to see changed does not want a long window here.
   */
  staleWhileRevalidate?: number;
  /** Request headers the response varies on, beyond the always-on defaults. */
  vary?: string[];
}

/**
 * Above this many bytes, hashing the body to produce an `ETag` costs more CPU
 * than the saved bandwidth is worth — a 304 only pays off when the render was
 * going to happen anyway and the payload is the expensive part. 256 KB is well
 * past every JSON page this API serves (the largest feed page is ~40 KB), so in
 * practice this only fires on an unexpected payload, which is exactly the case
 * where the guard should win.
 */
const MAX_ETAG_BYTES = 256 * 1024;

/** Cacheable request methods — a mutation never gets a cache header. */
function isCacheableMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

/**
 * Render a {@link CacheSpec} into the headers it implies.
 *
 * Exported for tests and for the rare route that must emit the same policy from
 * outside the wrapper; routes should prefer the `cache` option.
 */
export function buildCacheHeaders(spec: CacheSpec): Record<string, string> {
  const parts = [spec.visibility, `max-age=${spec.maxAge}`];
  // `s-maxage` is only read by shared caches, and a private response is by
  // definition never in one — emitting it would read as a contradiction.
  if (spec.visibility === 'public' && spec.sMaxAge != null) parts.push(`s-maxage=${spec.sMaxAge}`);
  if (spec.staleWhileRevalidate != null) {
    parts.push(`stale-while-revalidate=${spec.staleWhileRevalidate}`);
  }
  return {
    'cache-control': parts.join(', '),
    // Two always-on entries, for two different failure modes:
    //  • `Accept-Encoding` — without it a cache can hand a gzip body to a client
    //    that never asked for one.
    //  • `Cookie` on a private response — the belt to `private`'s braces. It is
    //    what stops any intermediary that ignores `private` from keying one
    //    user's response for the next. Cheap, and always correct.
    vary: [
      'Accept-Encoding',
      ...(spec.visibility === 'private' ? ['Cookie'] : []),
      ...(spec.vary ?? []),
    ].join(', '),
  };
}

/**
 * The file:line of the `defineHandler` call, for a definition-time error.
 *
 * A module-load throw has no request and no route context, so without this the
 * message would name nothing and the developer would be left grepping. Only
 * called on the throw path, so the stack capture is never in the hot path.
 */
function definitionSite(): string {
  const frames = (new Error().stack ?? '').split('\n').slice(1);
  for (const frame of frames) {
    const text = frame.trim();
    // Skip this module's own frames (`definitionSite`, `assertCacheSpec`,
    // `defineHandler`) — the first frame past them is the route file.
    if (!text || text.includes('handler.server')) continue;
    return text.replace(/^at\s+/, '');
  }
  return 'unknown call site';
}

/**
 * Reject an unshippable cache declaration **at module load**, not at request
 * time.
 *
 * This is the whole safety story of the feature. A `public` response from an
 * authenticated route is a data leak: the CDN stores the first caller's body
 * under a URL key and serves it to everyone else who asks. A request-time check
 * would fail only on the paths that get exercised, in an environment that has a
 * CDN in front of it — i.e. in production, after the leak. `defineHandler` runs
 * at import time for every route in the bundle, so throwing here means the
 * server does not boot and the mistake cannot reach a deploy.
 */
function assertCacheSpec(
  spec: CacheSpec,
  mode: AuthMode,
  feature: MemberFeature | undefined,
): void {
  const fail = (why: string): never => {
    throw new Error(`[api] invalid cache declaration at ${definitionSite()}: ${why}`);
  };

  if (spec.visibility !== 'public' && spec.visibility !== 'private') {
    fail(`cache.visibility must be 'public' or 'private' (got ${JSON.stringify(spec.visibility)})`);
  }
  if (!Number.isFinite(spec.maxAge) || spec.maxAge < 0) {
    fail(`cache.maxAge must be a non-negative number of seconds (got ${String(spec.maxAge)})`);
  }
  for (const [field, value] of [
    ['sMaxAge', spec.sMaxAge],
    ['staleWhileRevalidate', spec.staleWhileRevalidate],
  ] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      fail(`cache.${field} must be a non-negative number of seconds (got ${String(value)})`);
    }
  }

  if (spec.visibility !== 'public') return;

  if (mode === 'required' || mode === 'admin') {
    fail(
      `cache.visibility 'public' with auth '${mode}'. A shared cache keys on the URL, ` +
        `not on the session — the first caller's response would be served to every ` +
        `other caller. Use visibility 'private' (browser-only, Vary: Cookie), or ` +
        `drop the route to auth 'none'/'optional' if the body really is the same ` +
        `for everyone.`,
    );
  }
  if (feature) {
    fail(
      `cache.visibility 'public' with feature '${feature}'. A membership-gated ` +
        `response is per-account by construction and must never be shared. Use ` +
        `visibility 'private'.`,
    );
  }
}

/**
 * Weak `ETag` over the response body, or `null` when the body must not be
 * hashed.
 *
 * Weak (`W/`) because no byte-for-byte guarantee is made across compression or
 * field ordering — semantic equivalence is what a conditional request needs, and
 * a strong ETag would additionally promise range requests this API never serves.
 *
 * Two things it refuses to do, both of which turn a bandwidth optimisation into
 * an outage:
 *
 *  • **Buffer a stream.** An SSE response never ends, so hashing it would hang
 *    the request forever. Known streaming shapes are refused outright, and the
 *    read below is size-capped so anything else that turns out to be unbounded
 *    is abandoned after {@link MAX_ETAG_BYTES} rather than held in memory.
 *  • **Hash compressed bytes.** A body the handler already encoded hashes to
 *    something the next caller's encoding would not match, so the ETag would
 *    never hit. Compression belongs downstream of this.
 */
async function weakEtag(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.startsWith('text/event-stream')) return null;
  if (response.headers.get('content-encoding')) return null;
  if (response.headers.get('transfer-encoding')) return null;

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ETAG_BYTES) return null;

  // Clone so the caller's response body stays intact — a body is a one-shot
  // stream, and reading the original would leave nothing to send.
  const stream = response.clone().body;
  if (!stream) return null;

  const reader = stream.getReader();
  // Never awaited: `clone()` tees, and a tee branch's cancel() promise only
  // settles once BOTH branches are cancelled — awaiting it here would hang on
  // the branch the caller is still going to send.
  const release = () => void reader.cancel().catch(() => {});

  const hash = createHash('sha1');
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_ETAG_BYTES) {
        release();
        return null;
      }
      hash.update(value);
    }
  } catch {
    release();
    return null;
  }
  return `W/"${hash.digest('base64url')}"`;
}

/**
 * RFC 9110 §13.1.2 `If-None-Match` matching: `*` matches any representation,
 * otherwise the header is a comma-separated list compared with the **weak**
 * comparison function — so `W/"abc"` and `"abc"` are a match.
 */
function ifNoneMatchMatches(header: string, etag: string): boolean {
  const value = header.trim();
  if (value === '*') return true;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  const target = opaque(etag);
  return value.split(',').some((candidate) => opaque(candidate) === target);
}

/** Set a header, tolerating a Response whose headers are immutable (guarded). */
function withHeaders(response: Response, extra: Record<string, string>): Response {
  try {
    for (const [name, value] of Object.entries(extra)) response.headers.set(name, value);
    return response;
  } catch {
    // A Response that came back from `fetch()` has an immutable header guard.
    // Rebuild around the same body rather than dropping the policy.
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(extra)) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export interface HandlerOptions<
  A extends AuthMode = 'required',
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
> {
  /** Defaults to `'required'` — the safe default. Opt *out* deliberately. */
  auth?: A;
  /** Omit to skip rate limiting (reads that are already cheap and cached). */
  rateLimit?: RateLimitSpec;
  /** Zod schema for the JSON request body. Invalid/absent body → 400. */
  body?: B;
  /** Zod schema for `?query=params`, parsed from a flat string record. */
  query?: Q;
  /**
   * Validate `{}` instead of `null` when the body is absent or unparseable.
   *
   * Off by default, so a schema with any required field 400s on a bodyless
   * request. Turn it on for endpoints whose schema is entirely optional and
   * which are meant to accept a bare `POST` with no body at all.
   */
  allowEmptyBody?: boolean;
  /**
   * Return the first zod issue message in the 400 body instead of the generic
   * `'Invalid input'`.
   *
   * Off by default on purpose: zod messages name fields and spell out
   * constraints, which hands an unauthenticated caller a free description of
   * the schema. Turn it on only where the precise reason is genuinely useful to
   * a legitimate client (public/developer-facing endpoints).
   */
  verboseValidationErrors?: boolean;
  /**
   * Label used in the 500-path server log so a failure is still traceable to a
   * route. Defaults to `"<METHOD> <pathname>"`.
   */
  label?: string;
  /**
   * Gate the route behind a membership feature (`lib/entitlements/features.ts`).
   *
   * Refusal is a **402 carrying an upgrade envelope**, not a bare 403, so the
   * client can render "this needs HARD-R" with a link straight to the plan
   * instead of a toast that says "Forbidden". Routing every paywall through
   * here is what keeps the gate and the membership page's feature list derived
   * from the same declaration — a feature cannot be gated without also being
   * advertised.
   *
   * Runs after the session check (it needs a user) and before rate limiting, so
   * a free account hitting a paid endpoint gets the upsell rather than
   * eventually a 429. Implies `auth: 'required'` — an anonymous caller gets 401
   * first, because "sign in" is the more useful next step than "subscribe".
   */
  feature?: MemberFeature;
  /**
   * Honour an `Idempotency-Key` request header, replaying the first response
   * for a repeated key instead of running the handler twice.
   *
   * `ApiIdempotencyKey` and this behaviour already existed for `/api/v1/**`
   * via `withDeveloperApi`; the site's own mutations had none. That was
   * survivable while every write was a deliberate click, and stops being
   * survivable the moment writes are retried automatically — the service
   * worker's offline outbox and the at-least-once outbox delivery both replay
   * requests by design, so a double-post or a double-spend becomes a matter of
   * when, not whether.
   *
   * Only meaningful on mutations. Requests without the header are unaffected,
   * so turning this on is never a breaking change for an existing client.
   */
  idempotent?: boolean;
  /**
   * Declare the response's cache policy. See {@link CacheSpec}.
   *
   * Applied to **successful GET/HEAD responses only** — never to a mutation,
   * never to a 4xx/5xx. An invalid or unsafe declaration throws at module load.
   *
   * ```ts
   * GET: defineHandler(
   *   { auth: 'none', cache: { visibility: 'public', maxAge: 60, sMaxAge: 300 } },
   *   async () => Response.json(await listPublicGames()),
   * )
   * ```
   */
  cache?: CacheSpec;
  /**
   * Emit a weak `ETag` on 200 GET/HEAD responses and answer a matching
   * `If-None-Match` with a 304.
   *
   * Defaults to **on when `cache` is declared**, off otherwise: a route that has
   * thought about its freshness has, by the same act, told us its body is a
   * finite in-memory payload worth hashing. Set it explicitly either way —
   * `true` to get conditional requests without a freshness policy (the shape
   * that makes a rate limit survivable, per GitHub's REST API), `false` to opt a
   * cached route out because its body is large, streamed, or contains a
   * timestamp that changes the hash on every call and makes the whole mechanism
   * inert.
   */
  etag?: boolean;
}

type Parsed<S extends z.ZodType | undefined> = S extends z.ZodType ? z.infer<S> : undefined;

export interface ApiCtx<
  A extends AuthMode,
  B extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
> {
  request: Request;
  /** Route params (`$id` segments). Empty object for static routes. */
  params: Record<string, string>;
  session: SessionFor<A>;
  /** `null` when `auth` is `'optional'`/`'none'` and the caller is anonymous. */
  user: A extends 'required' | 'admin' ? ApiUser : ApiUser | null;
  // (kept adjacent to `userId` so the nullability of the pair reads together)
  userId: UserIdFor<A>;
  isAdmin: boolean;
  /** Validated body — `undefined` unless a `body` schema was supplied. */
  body: Parsed<B>;
  /** Validated query — `undefined` unless a `query` schema was supplied. */
  query: Parsed<Q>;
}

/* -------------------------------------------------------------------------- */
/* Canonical error responses                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The site's error envelope. Kept as a named export so routes that return an
 * error from *inside* their business logic use the same shape as the wrapper
 * rather than inventing a fifth spelling of "not found".
 */
export function apiError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
}

export const unauthorized = () => apiError('Unauthorized', 401);
export const forbidden = (message = 'Forbidden') => apiError(message, 403);
export const notFound = (message = 'Not found') => apiError(message, 404);
export const badRequest = (message = 'Invalid input') => apiError(message, 400);

/**
 * SHA-256 of the raw request body, for idempotency conflict detection.
 *
 * Kept here rather than imported from `idempotency.server` so the wrapper's
 * module graph does not pull in Prisma for every route — the idempotency store
 * itself is imported lazily, only on routes that opt in.
 */
function hashRequestBody(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/* -------------------------------------------------------------------------- */
/* Wrapper                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the route's rate limit.
 *
 * Routed through `withRateLimitAsync` — the Redis-backed path — rather than the
 * synchronous `withRateLimit`, because the in-process `Map` behind the latter
 * is per-process. This deployment runs the web tier plus six workers, and a
 * blue/green hotswap has 7005 and 7015 live at the same time, so the effective
 * ceiling was `limit × RATE_LIMIT_MULTIPLIER × processes`. Every route wrapped
 * here now shares one counter when `REDIS_URL` is set, and falls back to the
 * per-process limiter (looser, never absent) when it is not.
 */
function resolveRateLimit(request: Request, spec: RateLimitSpec, userId: string | null) {
  if (typeof spec === 'string') return withRateLimitAsync(request, spec, {});
  const { policy = 'write', scope, ...rest } = spec;
  return withRateLimitAsync(request, policy, {
    ...rest,
    // Only user-scope when we actually have a user; otherwise fall back to the
    // IP-only bucket rather than sharing one global `null:` bucket between all
    // anonymous callers — which would let one anon flood throttle everyone.
    ...(scope === 'user' && userId ? { scope: userId } : {}),
  });
}

/**
 * Wrap a site API route handler with the standard preamble.
 *
 * The returned function is a TanStack Start `server.handlers.*` entry. Anything
 * the inner handler returns is passed through untouched, so routes that stream,
 * redirect, or return non-JSON keep working.
 */
export function defineHandler<
  A extends AuthMode = 'required',
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
>(
  options: HandlerOptions<A, B, Q>,
  handler: (ctx: ApiCtx<A, B, Q>) => Promise<Response> | Response,
  // `params` must be spelled `Record<string, string>` — not a generic, not
  // `unknown`. TanStack infers a route's param type *through* the handler
  // signature, and child routes inherit their parent's. A weaker type here
  // collapses the parent's params to `{}`, which silently breaks `params.id`
  // in every child route (`$id/cancel`, `$id/matches/$matchId/report`, …).
): (args: { request: Request; params: Record<string, string> }) => Promise<Response> {
  const mode = (options.auth ?? 'required') as AuthMode;

  // Definition time, not request time. `defineHandler` is called while the route
  // module is being imported, so an unshippable cache declaration takes the
  // process down at boot instead of quietly leaking on the first cache hit.
  if (options.cache) assertCacheSpec(options.cache, mode, options.feature);
  const wantsEtag = options.etag ?? Boolean(options.cache);

  return async ({ request, params }) => {
    try {
      /* 1. Session ------------------------------------------------------- */
      let session: ApiSession = null;
      if (mode !== 'none') {
        // A transport/DB hiccup in the session lookup must not 500 a route that
        // tolerates anonymous callers — it degrades to "signed out" instead.
        session =
          mode === 'optional'
            ? await auth.api.getSession({ headers: request.headers }).catch(() => null)
            : await auth.api.getSession({ headers: request.headers });
      }

      const user = (session?.user ?? null) as ApiUser | null;
      const userId = user?.id ?? null;
      const isAdmin = Boolean(user?.isAdmin);

      if ((mode === 'required' || mode === 'admin') && !userId) return unauthorized();
      if (mode === 'admin' && !isAdmin) return forbidden();

      /* 1b. Membership gate ---------------------------------------------- */
      if (options.feature) {
        if (!userId) return unauthorized();
        // Imported lazily on purpose. `lib/entitlements` reaches for
        // `lib/prisma.server` at module scope, and a static import here would
        // put a live database connection in the import graph of *every* module
        // that pulls in `defineHandler` — which broke this file's own test suite
        // the moment the gate was added. Only routes that actually gate pay for
        // it, and the module system caches it after the first call.
        const { getUserTier } = await import('@/lib/entitlements');
        // Admins are not silently exempt: an admin on a free plan should see
        // exactly what a member sees, or the paywall is never dogfooded.
        const tier = await getUserTier(userId);
        if (!canUse(tier, options.feature)) {
          return Response.json(upgradeRequiredBody(options.feature), { status: 402 });
        }
      }

      /* 2. Rate limit ---------------------------------------------------- */
      if (options.rateLimit) {
        const limited = await resolveRateLimit(request, options.rateLimit, userId);
        if (limited) return limited;
      }

      /* 3. Validation ---------------------------------------------------- */
      // Generic unless the route opts in — see `verboseValidationErrors`.
      const reason = (err: z.ZodError, fallback: string) =>
        options.verboseValidationErrors ? (err.issues[0]?.message ?? fallback) : fallback;

      // Read the body ONCE as text. `request.json()` consumes the stream, and
      // the idempotency claim below needs the same bytes to hash — a second
      // read would throw, and re-serializing the parsed object would hash a
      // different string than the client sent (key order, number formatting).
      let rawBodyText: string | null = null;
      const needsBody = Boolean(options.body) || (options.idempotent && userId);
      if (needsBody) {
        rawBodyText = await request.text().catch(() => null);
      }

      let body: unknown;
      if (options.body) {
        let raw: unknown = null;
        if (rawBodyText) {
          try {
            raw = JSON.parse(rawBodyText);
          } catch {
            raw = options.allowEmptyBody ? {} : null;
          }
        } else if (options.allowEmptyBody) {
          raw = {};
        }
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) return badRequest(reason(parsed.error, 'Invalid input'));
        body = parsed.data;
      }

      let query: unknown;
      if (options.query) {
        const raw = Object.fromEntries(new URL(request.url).searchParams);
        const parsed = options.query.safeParse(raw);
        if (!parsed.success) return badRequest(reason(parsed.error, 'Invalid query'));
        query = parsed.data;
      }

      /* 3b. Idempotency claim -------------------------------------------- */
      // Claimed AFTER validation (no point reserving a key for a malformed
      // request) and BEFORE the handler, so a concurrent duplicate loses the
      // unique-constraint race instead of executing twice.
      const idemKey =
        options.idempotent && userId ? request.headers.get('idempotency-key')?.trim() : null;
      const pathname = new URL(request.url).pathname;

      if (idemKey && userId) {
        const { claimIdempotency } = await import('@/lib/api/idempotency.server');
        const claim = await claimIdempotency(
          userId,
          idemKey,
          request.method,
          pathname,
          hashRequestBody(rawBodyText ?? ''),
        );
        if (claim.kind === 'invalid') return badRequest('Idempotency-Key is too long');
        if (claim.kind === 'conflict') {
          return apiError('This Idempotency-Key was already used with a different request', 409);
        }
        if (claim.kind === 'in-flight') {
          return apiError('This request is already being processed', 409, { 'Retry-After': '1' });
        }
        if (claim.kind === 'replay') {
          return new Response(claim.body, {
            status: claim.status,
            headers: { 'Content-Type': 'application/json', 'Idempotency-Replayed': 'true' },
          });
        }
      }

      /* 4. Handler ------------------------------------------------------- */
      const ctx: ApiCtx<A, B, Q> = {
        request,
        params: (params ?? {}) as Record<string, string>,
        session: session as SessionFor<A>,
        user: user as ApiCtx<A, B, Q>['user'],
        userId: userId as UserIdFor<A>,
        isAdmin,
        body: body as Parsed<B>,
        query: query as Parsed<Q>,
      };

      let response: Response;
      try {
        response = await handler(ctx);
      } catch (handlerError) {
        // Release the claim so a genuine retry can run — a failed request must
        // not burn its key for the next 24 hours.
        if (idemKey && userId) {
          const { releaseIdempotency } = await import('@/lib/api/idempotency.server');
          await releaseIdempotency(userId, idemKey);
        }
        throw handlerError;
      }

      if (idemKey && userId) {
        // Buffer the body so it can be stored AND still returned. Cloning is
        // required: a Response body is a one-shot stream.
        const stored = await response.clone().text();
        const { recordIdempotency } = await import('@/lib/api/idempotency.server');
        await recordIdempotency(userId, idemKey, response.status, stored);
      }

      /* 5. Caching -------------------------------------------------------- */
      // Last, and deliberately narrow. A cache header on a mutation or on an
      // error is the kind of bug that is invisible locally and permanent at the
      // edge, so the gate is the method AND the status, checked here rather than
      // trusted to each route.
      if (!isCacheableMethod(request.method) || !response.ok) return response;

      const cacheHeaders = options.cache ? buildCacheHeaders(options.cache) : null;

      if (wantsEtag && response.status === 200) {
        const etag = await weakEtag(response);
        if (etag) {
          const inm = request.headers.get('if-none-match');
          if (inm && ifNoneMatchMatches(inm, etag)) {
            // A 304 MUST repeat the caching headers (RFC 9110 §15.4.5). Omit
            // them and the client's stored entry keeps expiring on whatever
            // policy it first saw — which is how a quiet revalidation turns back
            // into a full request storm one TTL later.
            const body = response.body;
            if (body) void body.cancel().catch(() => {});
            return new Response(null, { status: 304, headers: { etag, ...(cacheHeaders ?? {}) } });
          }
          response = withHeaders(response, { etag });
        }
      }

      return cacheHeaders ? withHeaders(response, cacheHeaders) : response;
    } catch (error) {
      // A named failure carries its own status and code; everything else is an
      // unnamed exception and becomes a bare 500. The message is never echoed
      // to the caller: a Prisma error can carry column names, connection
      // strings and row contents.
      if (isAppError(error)) {
        return Response.json(error.toBody(), { status: error.status });
      }
      const label = options.label ?? `${request.method} ${new URL(request.url).pathname}`;
      console.error(`[api] ${label} failed:`, error);
      return apiError('Internal Server Error', 500);
    }
  };
}
