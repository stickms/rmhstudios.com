/**
 * Client-safe URL safety helpers.
 *
 * Why this exists: zod's `.url()` validates URL *shape* but does NOT restrict
 * the scheme — it accepts `javascript:`, `data:`, and `vbscript:` URLs. React
 * also does not neutralize those schemes in `href`/`src`, so rendering a
 * user-supplied `javascript:...` value into an anchor is a stored-XSS sink.
 *
 * - `httpUrl()` builds a zod schema that only accepts http(s) URLs (validation).
 * - `safeHref()` sanitizes a value at the render sink (defense in depth).
 */

import { z } from 'zod';

/**
 * A zod schema that accepts only well-formed `http(s)` URLs up to `max` chars.
 * Compose with `.optional()` / `.nullable()` / `.or(z.literal(''))` as needed.
 */
export function httpUrl(max = 500) {
  return z
    .string()
    .max(max)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: 'Only http(s) URLs are allowed',
    });
}

/**
 * Convenience variant that also accepts the empty string (unset), matching the
 * `.or(z.literal(''))` composition used by existing schemas.
 */
export function httpUrlOrEmpty(max = 500) {
  return httpUrl(max).or(z.literal(''));
}

/**
 * Sanitize a URL for use in an anchor `href` / element `src`. Returns the URL
 * only when its protocol is exactly `http:` or `https:`; otherwise returns
 * `'#'`. Never throws on malformed input.
 */
export function safeHref(url: string | null | undefined): string {
  if (!url) return '#';
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : '#';
  } catch {
    return '#';
  }
}
