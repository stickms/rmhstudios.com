/**
 * Client-safe URL safety helpers.
 *
 * Why this exists: zod's `.url()` validates URL *shape* but does NOT restrict
 * the scheme — it accepts `javascript:`, `data:`, and `vbscript:` URLs. React
 * also does not neutralize those schemes in `href`/`src`, so rendering a
 * user-supplied `javascript:...` value into an anchor is a stored-XSS sink.
 *
 * - `httpUrl()` (in `lib/url-schema.ts`) builds a zod schema that only accepts
 *   http(s) URLs (validation). It is kept out of this module so that the
 *   render-side helper below does not bring zod onto every page that shows a
 *   user link.
 * - `safeHref()` sanitizes a value at the render sink (defense in depth).
 */

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
