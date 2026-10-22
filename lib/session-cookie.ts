/**
 * Does this request carry anything Better Auth could authenticate?
 *
 * Better Auth names its session cookies `*session_token` / `*session_data` (the
 * latter is the signed cookieCache snapshot), with a `__Secure-` / `__Host-`
 * prefix under HTTPS. `lib/auth.ts` registers no bearer, API-key, JWT or
 * multi-session plugin (only passkey, stripe and customSession), so the cookie
 * is the ONLY credential `auth.api.getSession` reads — a request without it
 * cannot resolve to a session. If a header-based plugin is ever added, extend
 * this helper in the same commit or the short-circuit will silently sign those
 * callers out.
 *
 * Pure (no `.server` imports) so both `defineHandler` and
 * `lib/auth-session.server.ts` share one definition, and tests need no mocks.
 */
export function hasSessionCookie(headers: Headers): boolean {
  const cookie = headers.get('cookie');
  if (!cookie) return false;
  return cookie.includes('session_token') || cookie.includes('session_data');
}
