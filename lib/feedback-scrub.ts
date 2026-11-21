// Zod-free on purpose: `lib/client-errors.ts` runs on every page, and the hot routes must reach no zod-importing
// module (`lib/__tests__/zod-off-hot-routes.test.ts`).

/**
 * An error message made safe to keep and send: emails, URL query strings and fragments, and long token-like runs are
 * replaced, so nothing a message happened to quote (an address, a signed URL, a key) reaches the inbox.
 */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, '[email]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#"']*)[?#][^\s"']*/gi, '$1')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[token]');
}
