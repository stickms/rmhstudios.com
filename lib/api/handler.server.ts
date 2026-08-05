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

      return response;
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
