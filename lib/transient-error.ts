/**
 * Is this the kind of failure that a second attempt usually fixes?
 *
 * Used by the route error fallback to retry once, automatically, instead of
 * showing "Something went wrong" for a dropped connection or a gateway blip
 * during a deploy. Deliberately conservative: only network-level failures and
 * proxy/gateway error pages match; an application error (validation, a thrown
 * bug) does not, so real bugs still surface immediately.
 */
const TRANSIENT_PATTERNS = [
  /failed to fetch/i, // Chromium network failure
  /load failed/i, // Safari network failure
  /networkerror when attempting to fetch/i, // Firefox
  /network request failed/i,
  /server temporarily unavailable/i, // lib/server-fn-retry.ts
  /bad gateway|service unavailable|gateway time-?out/i, // proxy error pages as text
  /error code: 5\d\d/i, // Cloudflare error page body
  /<html[\s>]/i, // an HTML page where JSON was expected
  /\b(?:502|503|504)\b/,
];

export function isTransientError(error: unknown): boolean {
  if (error == null) return false;
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  if (!message) return false;
  return TRANSIENT_PATTERNS.some((p) => p.test(message));
}
