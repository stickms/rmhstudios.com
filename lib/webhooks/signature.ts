/**
 * Pure webhook crypto + URL validation (no DB / server imports), so it can be
 * unit-tested and shared. Re-exported from emit.server for route convenience.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const WEBHOOK_SECRET_PREFIX = 'whsec_';

/** Generate a webhook signing secret (shown once at creation). */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString('base64url')}`;
}

/** Compute the signature value (`v1=` hex) over `${timestamp}.${body}`. */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time check of a received signature header against the expected value. */
export function verifyWebhookSignature(secret: string, header: string, body: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=').map((s) => s.trim()) as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = signWebhookPayload(secret, t, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Validate a webhook target URL: must be HTTPS and not point at localhost or a
 * private/link-local address (basic SSRF guard). Returns an error string or null.
 */
export function validateWebhookUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'url must be a valid absolute URL.';
  }
  if (url.protocol !== 'https:') return 'url must use https.';
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return 'url must not point at a private or local address.';
  }
  return null;
}
