/**
 * zod builders for user-supplied URLs. Why they exist is in `lib/url-safety.ts`
 * (zod's `.url()` accepts `javascript:`); they live apart from that module's
 * `safeHref()` because `safeHref` is on every profile and community page and
 * these are only used by input schemas — keeping them together put zod on
 * those routes.
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
