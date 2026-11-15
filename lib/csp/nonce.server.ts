/**
 * The per-request CSP nonce (redesign audit F5, docs/csp.md).
 *
 * Minted INSIDE TanStack Start's request scope: `getRouter()` in app/router.tsx
 * runs once per SSR request within Start's own request context, calls
 * {@link mintRequestCspNonce}, hands the value to the router's `ssr.nonce` (which
 * stamps it on every inline script, the streamed hydration scripts included,
 * and on `<meta property="csp-nonce">`), and this function puts the SAME value in
 * the response's Content-Security-Policy-Report-Only header through Start's
 * `setResponseHeader`. Header and markup therefore come from one call and cannot
 * disagree.
 *
 * (A first version minted the nonce in a Nitro `request` hook and read it back
 * through AsyncLocalStorage; Start renders outside that async context, so the
 * header carried a nonce the markup never did. Verified against a production
 * build before this replaced it.)
 */
import { randomBytes } from 'node:crypto';
import { setResponseHeader } from '@tanstack/react-start/server';
import { buildCspPolicy, REPORTING_ENDPOINTS } from '@/lib/csp/policy.server';

/** 128 random bits, base64 — the W3C-recommended minimum. */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Mint this request's nonce and set the report-only policy that names it.
 * Returns undefined (and sets nothing) outside a Start request, e.g. in tests.
 */
export function mintRequestCspNonce(): string | undefined {
  try {
    const nonce = generateNonce();
    setResponseHeader('Content-Security-Policy-Report-Only', buildCspPolicy({ nonce }));
    setResponseHeader('Reporting-Endpoints', REPORTING_ENDPOINTS);
    return nonce;
  } catch {
    // Not inside a Start request: no nonce, and the Nitro hook's hash-only
    // policy covers the response.
    return undefined;
  }
}
