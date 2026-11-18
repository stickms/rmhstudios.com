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
export const SIGN_IN_PROVIDERS =
  [
    'discord',
    'github',
    'steam',
    'twitch',
    'microsoft',
    'gitlab',
    'twitter',
  ] as const;

export type SignInProviderId =
  (typeof SIGN_IN_PROVIDERS)[number];

/** Brand names, which are not translated. */
export const PROVIDER_NAMES: Record<
  SignInProviderId,
  string
> =
  {
    discord:
      'Discord',
    github:
      'GitHub',
    steam:
      'Steam',
    twitch:
      'Twitch',
    microsoft:
      'Microsoft',
    gitlab:
      'GitLab',
    twitter:
      'X',
  };

/** Better Auth's `account.providerId` for an email-and-password sign-in. */
export const CREDENTIAL_PROVIDER_ID =
  'credential';

export function isSignInProviderId(
  id: string,
): id is SignInProviderId {
  return (
    SIGN_IN_PROVIDERS as readonly string[]
  ).includes(
    id,
  );
}

/**
 * How recent a session must be to change how an account signs in (connect,
 * disconnect, change email, join accounts). A session stolen earlier than this
 * cannot add a way in. Enforced in `lib/auth/consolidation.server.ts`.
 */
export const FRESH_SESSION_MS =
  10 *
  60 *
  1000;

/** The error code the server sends when a change needs a more recent sign-in. */
export const SESSION_NOT_FRESH =
  'SESSION_NOT_FRESH';

/**
 * Better Auth gives a user from a provider that shares no email (Steam, X
 * without the email permission) a stand-in address of the form
 * `<provider-user-id>@<provider>.placeholder.invalid`, so the `user.email`
 * column stays unique and non-null. `.invalid` is reserved by RFC 6761 §6.4: it
 * can never resolve, so the address can never belong to a real inbox, and no
 * other account can match it by email.
 */
export const PLACEHOLDER_EMAIL_SUFFIX =
  '.placeholder.invalid';

/** True for a stand-in address that must never be emailed or typed into a form. */
export function isPlaceholderEmail(
  email:
    | string
    | null
    | undefined,
): boolean {
  return (
    typeof email ===
      'string' &&
    email
      .trim()
      .toLowerCase()
      .endsWith(
        PLACEHOLDER_EMAIL_SUFFIX,
      )
  );
}

/** The stand-in address for a provider identity, in Better Auth's own format. */
export function placeholderEmail(
  providerId: string,
  accountId: string,
): string {
  return `${accountId}@${providerId}${PLACEHOLDER_EMAIL_SUFFIX}`;
}
