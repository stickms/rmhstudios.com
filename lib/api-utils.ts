/**
 * Shared utilities for Next.js API routes.
 *
 * Centralizes repeated patterns (auth checks, error responses, rate limiting)
 * to reduce boilerplate and enforce consistent behaviour across all routes.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Get the current authenticated session. Returns null if not authenticated.
 * Wraps the repetitive `auth.api.getSession({ headers: await headers() })` pattern.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Get session or return a 401 response. Use in routes that require auth:
 *
 *   const [session, errorResponse] = await requireSession();
 *   if (errorResponse) return errorResponse;
 *   // session is guaranteed non-null here
 */
export async function requireSession(): Promise<
  [NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>, null] |
  [null, NextResponse]
> {
  const session = await getSession();
  if (!session?.user) {
    return [null, NextResponse.json({ error: "Unauthorized" }, { status: 401 })];
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
): NextResponse | null {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, opts);
  if (!allowed) {
    return NextResponse.json(
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
  return NextResponse.json({ error: message }, { status });
}
