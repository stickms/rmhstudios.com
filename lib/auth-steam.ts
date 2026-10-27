/**
 * Better Auth plugin: sign in with, or link, a Steam account.
 *
 * Steam speaks OpenID 2.0, not OAuth, so Better Auth's social providers do not
 * cover it; the protocol checks live in `steam-openid.ts` (unit-tested). This
 * file only wires them to Better Auth's sessions and accounts:
 *
 *   GET /api/auth/steam/start?mode=signin|link&callbackURL=/path
 *   GET /api/auth/steam/callback            (Steam returns here)
 *
 * The identity is stored like any other provider: an `account` row with
 * `providerId = 'steam'` and `accountId = <SteamID64>`. Steam shares no email,
 * so a first-time sign-in creates a user with a non-routable placeholder
 * address; it is never matched to an existing user by email, and `link` (which
 * needs a signed-in session) is the only way to attach Steam to an existing one.
 */

import { createAuthEndpoint } from 'better-auth/api';
import { getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthPlugin } from 'better-auth';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import {
  buildAuthUrl,
  fetchSteamProfile,
  safeCallback,
  steamPlaceholderEmail,
  verifyAssertion,
} from '@/lib/steam-openid';

const STATE_COOKIE = 'rmh-steam-state';

interface StatePayload {
  s: string;
  mode: 'signin' | 'link';
  cb: string;
}

export const steam = () =>
  ({
    id: 'steam',
    endpoints: {
      steamStart: createAuthEndpoint(
        '/steam/start',
        { method: 'GET' },
        async (ctx) => {
          // Parsed by hand: this module is in lib/auth.ts's import graph, which every hot
          // route reaches, and those stay free of zod (lib/__tests__/zod-off-hot-routes).
          const query = (ctx.query ?? {}) as Record<string, unknown>;
          const mode = query.mode === 'link' ? 'link' : 'signin';
          const cb = safeCallback(typeof query.callbackURL === 'string' ? query.callbackURL : undefined);
          if (mode === 'link') {
            const session = await getSessionFromCtx(ctx);
            if (!session) throw ctx.redirect(`/login?next=${encodeURIComponent(cb)}`);
          }
          const state = randomBytes(16).toString('hex');
          const payload: StatePayload = { s: state, mode, cb };
          await ctx.setSignedCookie(STATE_COOKIE, JSON.stringify(payload), ctx.context.secret, {
            httpOnly: true,
            sameSite: 'lax',
            secure: ctx.context.baseURL.startsWith('https://'),
            maxAge: 600,
            path: '/',
          });
          const returnTo = `${ctx.context.baseURL}/steam/callback?s=${state}`;
          throw ctx.redirect(buildAuthUrl({ returnTo, realm: new URL(ctx.context.baseURL).origin }));
        },
      ),

      steamCallback: createAuthEndpoint('/steam/callback', { method: 'GET' }, async (ctx) => {
        const raw = await ctx.getSignedCookie(STATE_COOKIE, ctx.context.secret);
        ctx.setCookie(STATE_COOKIE, '', { maxAge: 0, path: '/' });
        let payload: StatePayload | null = null;
        try {
          payload = raw ? (JSON.parse(raw) as StatePayload) : null;
        } catch {
          payload = null;
        }
        const url = new URL(ctx.request?.url ?? '');
        const fail = (code: string): never => {
          throw ctx.redirect(`/login?error=${code}`);
        };
        // The state must be the one we issued to this browser (blocks login CSRF).
        if (!payload || payload.s !== url.searchParams.get('s')) return fail('steam_state');

        const returnTo = `${ctx.context.baseURL}/steam/callback?s=${payload.s}`;
        const steamId = await verifyAssertion(url.searchParams, { returnTo });
        if (!steamId) return fail('steam_failed');
        const cb = safeCallback(payload.cb);
        const dest = (flag: string) => `${cb}${cb.includes('?') ? '&' : '?'}steam=${flag}`;

        const existing = await prisma.account.findFirst({
          where: { providerId: 'steam', accountId: steamId },
          select: { userId: true },
        });

        if (payload.mode === 'link') {
          const session = await getSessionFromCtx(ctx);
          if (!session) return fail('steam_failed');
          if (existing && existing.userId !== session.user.id) throw ctx.redirect(dest('conflict'));
          if (!existing) {
            await ctx.context.internalAdapter.createAccount({
              userId: session.user.id,
              providerId: 'steam',
              accountId: steamId,
            });
          }
          throw ctx.redirect(dest('linked'));
        }

        let user = existing ? await ctx.context.internalAdapter.findUserById(existing.userId) : null;
        if (!user) {
          const profile = await fetchSteamProfile(steamId);
          const created = await ctx.context.internalAdapter.createOAuthUser(
            {
              email: steamPlaceholderEmail(steamId),
              emailVerified: false,
              name: profile?.name ?? 'Steam user',
              image: profile?.image ?? undefined,
            },
            { providerId: 'steam', accountId: steamId },
          );
          user = created.user;
        }
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) return fail('steam_failed');
        await setSessionCookie(ctx, { session, user });
        throw ctx.redirect(cb);
      }),
    },
  }) satisfies BetterAuthPlugin;
