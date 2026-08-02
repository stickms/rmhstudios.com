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

import type { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  withRateLimit,
  type RateLimitPolicy,
  type WithRateLimitOptions,
} from '@/lib/rate-limit';

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

/* -------------------------------------------------------------------------- */
/* Wrapper                                                                    */
/* -------------------------------------------------------------------------- */

function resolveRateLimit(request: Request, spec: RateLimitSpec, userId: string | null) {
  if (typeof spec === 'string') return withRateLimit(request, spec, {});
  const { policy = 'write', scope, ...rest } = spec;
  return withRateLimit(request, policy, {
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

      /* 2. Rate limit ---------------------------------------------------- */
      if (options.rateLimit) {
        const limited = resolveRateLimit(request, options.rateLimit, userId);
        if (limited) return limited;
      }

      /* 3. Validation ---------------------------------------------------- */
      // Generic unless the route opts in — see `verboseValidationErrors`.
      const reason = (err: z.ZodError, fallback: string) =>
        options.verboseValidationErrors ? (err.issues[0]?.message ?? fallback) : fallback;

      let body: unknown;
      if (options.body) {
        const raw = await request.json().catch(() => (options.allowEmptyBody ? {} : null));
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

      /* 4. Handler ------------------------------------------------------- */
      return await handler({
        request,
        params: (params ?? {}) as Record<string, string>,
        session: session as SessionFor<A>,
        user: user as ApiCtx<A, B, Q>['user'],
        userId: userId as UserIdFor<A>,
        isAdmin,
        body: body as Parsed<B>,
        query: query as Parsed<Q>,
      });
    } catch (error) {
      // The message is never echoed to the caller: a Prisma error can carry
      // column names, connection strings and row contents.
      const label = options.label ?? `${request.method} ${new URL(request.url).pathname}`;
      console.error(`[api] ${label} failed:`, error);
      return apiError('Internal Server Error', 500);
    }
  };
}
