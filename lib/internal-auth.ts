import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets / bearer tokens.
 *
 * A plain `a !== b` short-circuits on the first differing byte, leaking —
 * through response timing — how much of a guessed secret is correct and
 * enabling a byte-by-byte recovery attack. Hashing both inputs to a fixed
 * 32-byte digest and comparing with `timingSafeEqual` removes that side channel
 * (and the equal-length requirement / length leak of comparing the raw
 * strings). Server-only (uses node:crypto).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Authorize a server-to-server internal request by shared secret.
 *  - configured secret missing/empty -> 503 (the internal API is disabled)
 *  - provided header missing or mismatched -> 401
 *  - otherwise -> ok
 */
export function authorizeInternalRequest(
  provided: string | null,
  configured: string | undefined,
): { ok: true } | { ok: false; status: 401 | 503 } {
  if (!configured) return { ok: false, status: 503 };
  if (!provided || !timingSafeStringEqual(provided, configured)) return { ok: false, status: 401 };
  return { ok: true };
}
