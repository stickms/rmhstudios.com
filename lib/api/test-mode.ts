/**
 * Sandbox ("test mode") responses for `rmh_test_` developer API keys.
 *
 * A test key authenticates like any other key and is rate-limited and scoped
 * the same way, but it never reaches a route handler: reads answer with the
 * documented example payload for the endpoint, writes are acknowledged with a
 * realistic status + body and change nothing. No real account data is read or
 * written, so integrations can be built without touching a live account.
 */
import { ENDPOINTS, type ApiEndpoint } from '@/lib/api/registry';

export const TEST_KEY_PREFIX = 'rmh_test_';

export function isTestKey(plaintext: string): boolean {
  return plaintext.startsWith(TEST_KEY_PREFIX);
}

const compiled = ENDPOINTS.map((ep) => ({
  ep,
  re: new RegExp(
    '^' + ep.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+') + '/?$',
  ),
}));

export function findEndpoint(method: string, pathname: string): ApiEndpoint | null {
  const m = method.toUpperCase();
  return compiled.find((c) => c.ep.method === m && c.re.test(pathname))?.ep ?? null;
}

export interface SandboxResult {
  status: number;
  body: unknown | null;
}

/** The sandbox answer for a request, or null when the endpoint does not exist. */
export function sandboxResponse(
  method: string,
  pathname: string,
  requestBody: unknown,
  newId: () => string,
): SandboxResult | null {
  const ep = findEndpoint(method, pathname);
  if (!ep) return null;
  const example = ep.responseExample;
  if (ep.method === 'GET') {
    if (example !== undefined) return { status: 200, body: example };
    return { status: 200, body: ep.paginated ? { data: [], nextCursor: null } : {} };
  }
  const status = ep.status ?? 200;
  if (status === 204) return { status, body: null };
  const base = example && typeof example === 'object' && !Array.isArray(example) ? example : {};
  const echoed =
    requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)
      ? (requestBody as Record<string, unknown>)
      : {};
  return {
    status,
    body: { ...base, ...echoed, id: `test_${newId()}`, livemode: false, sandbox: true },
  };
}
