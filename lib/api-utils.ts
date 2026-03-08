/**
 * Shared utilities for API routes.
 *
 * Centralizes repeated patterns (auth checks, error responses, rate limiting)
 * to reduce boilerplate and enforce consistent behaviour across all routes.
 */

import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Get the current authenticated session from a Request object.
 * Returns null if not authenticated.
 */
export async function getSessionFromRequest(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}

/**
 * Get session or return a 401 response. Use in routes that require auth:
 *
 *   const [session, errorResponse] = await requireSession(request);
 *   if (errorResponse) return errorResponse;
 *   // session is guaranteed non-null here
 */
export async function requireSession(request: Request): Promise<
  [NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>, null] |
  [null, Response]
> {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return [null, Response.json({ error: "Unauthorized" }, { status: 401 })];
  }
  return [session, null];
}

/**
 * Apply rate limiting to an API request. Returns a 429 response if blocked.
 *
 *   const limited = applyRateLimit(request, { limit: 10, windowMs: 60_000, prefix: "feed" });
 *   if (limited) return limited;
 */
export function applyRateLimit(
  request: Request,
  opts: { limit: number; windowMs: number; prefix?: string },
): Response | null {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, opts);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }
  return null;
}

/** Standard JSON error response. */
export function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
