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
  if (!provided || provided !== configured) return { ok: false, status: 401 };
  return { ok: true };
}
