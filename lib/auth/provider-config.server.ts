/**
 * Which sign-in providers are switched on, read from the environment.
 *
 * Discord and GitHub are always configured (as before: the site has always
 * shipped with both). Every provider added since is ON only when its
 * credentials are set, so a deploy that has not registered an app with that
 * provider shows no button for it, and Better Auth never builds a provider
 * with an empty client id. `lib/auth.ts` reads `socialProviderConfig()`; the
 * login page reads `enabledSignInProviders()` through
 * `sign-in-providers.functions.ts`.
 *
 * Each provider's callback URL, to register in its developer console:
 *   https://<host>/api/auth/callback/<id>     (twitch, microsoft, gitlab, twitter)
 *   https://<host>/api/auth/steam/callback    (steam: nothing to register; OpenID needs no app)
 */
import { SIGN_IN_PROVIDERS, type SignInProviderId } from '@/lib/auth/providers';

function both(
  id: string | undefined,
  secret: string | undefined,
): {
  clientId: string;
  clientSecret: string;
} | null {
  return id && secret
    ? {
        clientId: id,
        clientSecret: secret,
      }
    : null;
}

const env = process.env;

const credentials = {
  twitch: both(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET),
  microsoft: both(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET),
  gitlab: both(env.GITLAB_CLIENT_ID, env.GITLAB_CLIENT_SECRET),
  twitter: both(env.X_CLIENT_ID, env.X_CLIENT_SECRET),
};

/** The Steam Web API key; Steam sign-in is on exactly when it is set. */
export const steamApiKey: string | undefined = env.STEAM_API_KEY || undefined;

/** The `socialProviders` block for `betterAuth()`. */
export function socialProviderConfig() {
  return {
    discord: {
      clientId: env.DISCORD_CLIENT_ID!,
      clientSecret: env.DISCORD_CLIENT_SECRET!,
      overrideUserInfoOnSignIn: true,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
      overrideUserInfoOnSignIn: true,
    },
    ...(credentials.twitch && {
      twitch: {
        ...credentials.twitch,
        overrideUserInfoOnSignIn: true,
      },
    }),
    ...(credentials.microsoft && {
      microsoft: {
        ...credentials.microsoft,
        // Personal (Outlook, Xbox) and work or school accounts alike.
        tenantId: env.MICROSOFT_TENANT_ID || 'common',
        prompt: 'select_account' as const,
        // The provider would otherwise store the Graph photo as a base64
        // `data:` URL in `user.image`, which then rides in every session
        // cookie (cookieCache) and every user-display payload.
        disableProfilePhoto: true,
        overrideUserInfoOnSignIn: true,
      },
    }),
    ...(credentials.gitlab && {
      gitlab: {
        ...credentials.gitlab,
        ...(env.GITLAB_ISSUER
          ? {
              issuer: env.GITLAB_ISSUER,
            }
          : {}),
        overrideUserInfoOnSignIn: true,
      },
    }),
    // X shares a confirmed email only when the app has "Request email from
    // users" turned on; otherwise the user gets a placeholder address.
    ...(credentials.twitter && {
      twitter: {
        ...credentials.twitter,
        overrideUserInfoOnSignIn: true,
      },
    }),
  };
}

/** The providers that have a working button, in display order. */
export function enabledSignInProviders(): SignInProviderId[] {
  return SIGN_IN_PROVIDERS.filter((id) => {
    if (id === 'discord' || id === 'github') return true;
    if (id === 'steam') return steamApiKey !== undefined;
    return credentials[id] !== null;
  });
}
