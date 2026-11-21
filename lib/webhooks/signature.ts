/**
 * Pure webhook crypto + URL validation (no DB / server imports), so it can be
 * unit-tested and shared. Re-exported from emit.server for route convenience.
 */

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

export const WEBHOOK_SECRET_PREFIX =
  'whsec_';

/** Generate a webhook signing secret (shown once at creation). */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString('base64url')}`;
}

/** Compute the signature value (`v1=` hex) over `${timestamp}.${body}`. */
export function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  return createHmac(
    'sha256',
    secret,
  )
    .update(
      `${timestamp}.${body}`,
    )
    .digest(
      'hex',
    );
}

/**
 * The secrets a delivery is signed with right now: the current one first, then
 * the rotated-out one while its overlap window (`previousSecretExpiresAt`) is
 * still open.
 */
export function activeSigningSecrets(
  endpoint: {
    secret: string;
    previousSecret?: string | null;
    previousSecretExpiresAt?: Date | null;
  },
  now: Date,
): string[] {
  const overlap =
    endpoint.previousSecret &&
    endpoint.previousSecretExpiresAt &&
    endpoint.previousSecretExpiresAt.getTime() > now.getTime();
  return overlap ? [endpoint.secret, endpoint.previousSecret as string] : [endpoint.secret];
}

/**
 * The `X-RMH-Signature` header value: `t=<seconds>` then one `v1=` per secret.
 * Two secrets are passed while a rotation overlap lasts (newest first), so a
 * receiver holding either one verifies the same delivery.
 */
export function signatureHeader(
  secrets: readonly string[],
  timestamp: number,
  body: string,
): string {
  return [
    `t=${timestamp}`,
    ...secrets.map((secret) => `v1=${signWebhookPayload(secret, timestamp, body)}`),
  ].join(',');
}

/**
 * Constant-time check of a received signature header against the expected
 * value. A header may carry several `v1=` parts (rotation overlap); a match on
 * any one of them verifies.
 */
export function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
  toleranceSec = 300,
): boolean {
  let t = NaN;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') t = Number(value);
    else if (key === 'v1' && value) candidates.push(value);
  }
  if (!Number.isFinite(t) || candidates.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(signWebhookPayload(secret, t, body));
  // Every candidate is compared (no early exit on a match) so timing does not
  // reveal which position matched.
  let ok = false;
  for (const candidate of candidates) {
    const got = Buffer.from(candidate);
    if (got.length === expected.length && timingSafeEqual(expected, got)) ok = true;
  }
  return ok;
}

/**
 * Validate a webhook target URL: must be HTTPS and not point at localhost or a
 * private/link-local address (basic SSRF guard). Returns an error string or null.
 */
export function validateWebhookUrl(
  raw: string,
):
  | string
  | null {
  let url: URL;
  try {
    url =
      new URL(
        raw,
      );
  } catch {
    return 'url must be a valid absolute URL.';
  }
  if (
    url.protocol !==
    'https:'
  )
    return 'url must use https.';
  const host =
    url.hostname.toLowerCase();
  if (
    host ===
      'localhost' ||
    host ===
      '0.0.0.0' ||
    host ===
      '::1' ||
    host.endsWith(
      '.local',
    ) ||
    /^127\./.test(
      host,
    ) ||
    /^10\./.test(
      host,
    ) ||
    /^192\.168\./.test(
      host,
    ) ||
    /^169\.254\./.test(
      host,
    ) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(
      host,
    )
  ) {
    return 'url must not point at a private or local address.';
  }
  return null;
}
