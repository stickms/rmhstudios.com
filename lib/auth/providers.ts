/**
 * The sign-in providers the site knows about, and the one rule every caller
 * needs about accounts that came from a provider without an email.
 *
 * Client-safe: the login page reads `SIGN_IN_PROVIDERS` for its button order,
 * `lib/email/send.server.ts` and `lib/auth.ts` read `isPlaceholderEmail`.
 * Which providers are actually switched on depends on server env vars and is
 * decided in `provider-config.server.ts`.
 */

/**
 * Every sign-in provider, in the order the login page shows them. The id is the
 * Better Auth provider id, so it is also the `account.providerId` value and the
 * last segment of the provider's callback URL (`/api/auth/callback/<id>`,
 * except Steam, which is `/api/auth/steam/callback`). X keeps Better Auth's
 * historical id, `twitter`.
 */
export const SIGN_IN_PROVIDERS = [
  'discord',
  'github',
  'steam',
  'twitch',
  'microsoft',
  'gitlab',
  'twitter',
  'reddit',
] as const;

export type SignInProviderId = (typeof SIGN_IN_PROVIDERS)[number];

/**
 * Better Auth gives a user from a provider that shares no email (Reddit, X
 * without the email permission, Steam) a stand-in address of the form
 * `<provider-user-id>@<provider>.placeholder.invalid`, so the `user.email`
 * column stays unique and non-null. `.invalid` is reserved by RFC 6761 §6.4: it
 * can never resolve, so the address can never belong to a real inbox, and no
 * other account can match it by email.
 */
export const PLACEHOLDER_EMAIL_SUFFIX = '.placeholder.invalid';

/** True for a stand-in address that must never be emailed or typed into a form. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/** The stand-in address for a provider identity, in Better Auth's own format. */
export function placeholderEmail(providerId: string, accountId: string): string {
  return `${accountId}@${providerId}${PLACEHOLDER_EMAIL_SUFFIX}`;
}
