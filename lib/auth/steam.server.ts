/**
 * "Sign in with Steam" as a Better Auth plugin.
 *
 * Steam is OpenID 2.0 (see `steam-openid.ts` for the protocol checks), so it
 * cannot be a `socialProviders` entry. Instead this plugin adds two endpoints
 * under the existing `/api/auth/$` splat and hands the verified identity to the
 * same `handleOAuthUserInfo` the built-in providers use, so a Steam account is
 * stored, linked, rate-limited, hooked (handle assignment, session alerts,
 * Stripe customer) and issued a session exactly like a Discord or GitHub one:
 *
 *   POST /api/auth/sign-in/steam   { callbackURL } -> { url, redirect: true }
 *   GET  /api/auth/steam/callback  (Steam redirects the browser here)
 *
 * The flow's state is Better Auth's own `generateState`/`parseState`: a
 * single-use, ten-minute record bound to a cookie in this browser, which is the
 * login-CSRF protection (an assertion minted in an attacker's browser carries a
 * state this browser never issued). The state also rides inside `return_to`,
 * and `parseSteamAssertion` requires Steam's signed `return_to` to equal it
 * exactly, so an assertion cannot be replayed into a different flow.
 *
 * Steam shares no email address. The user gets Better Auth's non-routable
 * placeholder (`<steamid>@steam.placeholder.invalid`) and `emailVerified:
 * false`, which means: it can never be auto-linked to an existing account by
 * email (the #408 linking policy refuses unverified provider emails), and
 * `lib/email/send.server.ts` never sends to it.
 *
 * Display name and avatar come from the Steam Web API (`STEAM_API_KEY`, free
 * from https://steamcommunity.com/dev/apikey). Authentication itself does not
 * need the key; the key is what makes the account look like its owner.
 */
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { generateState, handleOAuthUserInfo, parseState } from 'better-auth/oauth2';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { placeholderEmail } from '@/lib/auth/providers';
import {
  STEAM_OPENID_ENDPOINT,
  buildSteamLoginUrl,
  isValidVerificationResponse,
  parseSteamAssertion,
} from '@/lib/auth/steam-openid';

export const STEAM_PROVIDER_ID = 'steam';

const STEAM_TIMEOUT_MS = 10_000;

interface SteamProfile {
  name: string;
  image: string | undefined;
}

/** Name and avatar from the Steam Web API, or `null` when it cannot be read. */
async function fetchSteamProfile(apiKey: string, steamId: string): Promise<SteamProfile | null> {
  const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamids', steamId);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      response?: { players?: Array<{ steamid?: string; personaname?: string; avatarfull?: string }> };
    };
    const player = body.response?.players?.find((p) => p.steamid === steamId);
    const name = player?.personaname?.trim();
    if (!name) return null;
    const image = player?.avatarfull?.startsWith('https://') ? player.avatarfull : undefined;
    return { name: name.slice(0, 64), image };
  } catch {
    return null;
  }
}

/** Ask Steam whether it really issued this assertion (OpenID 2.0 §11.4.2). */
async function verifyWithSteam(body: URLSearchParams): Promise<boolean> {
  try {
    const res = await fetch(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
    });
    return res.ok && isValidVerificationResponse(await res.text());
  } catch {
    return false;
  }
}

/** `apiKey` unset means Steam sign-in is off: both endpoints answer 404. */
export function steam({ apiKey }: { apiKey: string | undefined }) {
  const off = () => new APIError('NOT_FOUND', { message: 'Steam sign-in is not enabled.' });

  return {
    id: STEAM_PROVIDER_ID,
    endpoints: {
      signInSteam: createAuthEndpoint(
        '/sign-in/steam',
        {
          method: 'POST',
          // `callbackURL` and `errorCallbackURL` are checked against
          // `trustedOrigins` by Better Auth's global origin-check middleware,
          // which runs for every POST, before this handler.
          body: z.object({
            callbackURL: z.string().optional(),
            errorCallbackURL: z.string().optional(),
            newUserCallbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          if (!apiKey) throw off();
          const { state } = await generateState(ctx);
          const returnTo = `${ctx.context.baseURL}/steam/callback?state=${encodeURIComponent(state)}`;
          const url = buildSteamLoginUrl({ returnTo, realm: new URL(ctx.context.baseURL).origin });
          return ctx.json({ url, redirect: true });
        },
      ),

      steamCallback: createAuthEndpoint(
        '/steam/callback',
        {
          method: 'GET',
          query: z.record(z.string(), z.string()).optional(),
        },
        async (ctx) => {
          if (!apiKey) throw off();
          // Throws a redirect to the error page itself when the state is
          // missing, expired, already used or from another browser.
          const { callbackURL, errorURL, newUserURL } = await parseState(ctx);

          const fail = (code: string): never => {
            const target = new URL(errorURL ?? `${ctx.context.baseURL}/error`, ctx.context.baseURL);
            target.searchParams.set('error', code);
            throw ctx.redirect(target.toString());
          };

          const state = ctx.query?.state ?? '';
          const params = new URLSearchParams(ctx.query ?? {});
          const expectedReturnTo = `${ctx.context.baseURL}/steam/callback?state=${encodeURIComponent(state)}`;
          const assertion = parseSteamAssertion(params, expectedReturnTo);
          if (!assertion.ok) {
            ctx.context.logger.warn('Steam assertion refused', { reason: assertion.error });
            return fail(assertion.error === 'cancelled' ? 'access_denied' : 'steam_invalid_assertion');
          }
          if (!(await verifyWithSteam(assertion.verificationBody))) {
            ctx.context.logger.warn('Steam did not confirm the assertion');
            return fail('steam_verification_failed');
          }

          const { steamId } = assertion;
          const profile = await fetchSteamProfile(apiKey, steamId);

          const result = await handleOAuthUserInfo(ctx, {
            userInfo: {
              id: steamId,
              email: placeholderEmail(STEAM_PROVIDER_ID, steamId),
              emailVerified: false,
              name: profile?.name ?? 'Steam user',
              image: profile?.image ?? null,
            },
            account: { providerId: STEAM_PROVIDER_ID, accountId: steamId },
            callbackURL,
            // Like the other providers (`overrideUserInfoOnSignIn`), keep the
            // name and avatar in step with Steam, but never overwrite them with
            // the fallback when the Web API could not be read.
            overrideUserInfo: profile !== null,
            source: { method: 'oauth', oauth: { providerId: STEAM_PROVIDER_ID } },
          });
          if (result.error || !result.data) {
            ctx.context.logger.error('Steam sign-in failed', { error: result.error });
            return fail((result.error ?? 'unable_to_create_user').split(' ').join('_'));
          }

          await setSessionCookie(ctx, result.data);
          throw ctx.redirect(result.isRegister ? newUserURL || callbackURL : callbackURL);
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
