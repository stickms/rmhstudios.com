/**
 * Post-sign-in redirect targets. Shared by the login page and the account
 * connect page, both of which take a `callbackURL` / `next` from the URL.
 */

/**
 * Only allow a same-site absolute path as a post-login redirect target.
 * Browsers strip control characters and normalize "\" to "/", so a naive
 * `startsWith('/') && !startsWith('//')` guard is bypassed by "/\evil.com" or
 * "/\t//evil.com" — both resolve to an off-site protocol-relative URL when
 * assigned to `window.location.href`. Require a leading "/" NOT followed by "/"
 * or "\", and reject control characters. (SSR-safe: no `window` access.)
 */
export function safeInternalPath(raw?: string): string {
  if (!raw) return '/';
  // Reject any control character (U+0000–U+001F or U+007F): browsers strip them
  // before navigating, which would otherwise let "/\t//evil.com" slip past the
  // leading-slash guard below. A char-code scan avoids embedding raw control
  // bytes (or a control-char regex) in source.
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return '/';
  }
  return /^\/(?![/\\])/.test(raw) ? raw : '/';
}
