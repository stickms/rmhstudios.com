/**
 * The per-request CSP nonce (redesign audit F5).
 *
 * `server/nitro/security-headers.ts` calls {@link enterRequestNonce} from Nitro's
 * `request` hook (the same `enterWith` mechanism `server/nitro/otel.ts` uses for
 * the trace scope), so the router factory — `getRouter()` in app/router.tsx, which
 * runs once per SSR request — can read it with {@link currentRequestNonce} and hand
 * it to `ssr.nonce`. The same value is then put in the response's
 * Content-Security-Policy-Report-Only header by the `response` hook.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const als = new AsyncLocalStorage<{ nonce: string }>();

/** 128 random bits, base64 — the W3C-recommended minimum. */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/** Mint a nonce for the current async context and return it. */
export function enterRequestNonce(): string {
  const nonce = generateNonce();
  als.enterWith({ nonce });
  return nonce;
}

/** The nonce of the request being rendered, or undefined outside one. */
export function currentRequestNonce(): string | undefined {
  return als.getStore()?.nonce;
}
