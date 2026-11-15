import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { signWikiPass, wikiLoginKey, wikiPublicUrl } from '@/lib/wiki/sso.server';
import { wikiSsoQuery } from '@/lib/wiki/wiki-schema';
import { wikiSsoApi } from '@/lib/wiki/wiki.contract';

/** A redirect nothing may cache: the destination depends on who is asking and carries a pass. */
function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}

const wikiLogin = (query: string) => `${wikiPublicUrl()}/wiki/Special:RMHStudiosLogin?${query}`;

/**
 * GET /api/wiki/sso?state=… — sign in to the wiki (lib/wiki/sso.server.ts).
 *
 * Signed out: to the site's login page, which comes back here afterwards.
 * Signed in: back to the wiki with a two-minute pass for the wiki's `state`.
 * A suspended account or one without a handle goes back with an error the wiki
 * explains instead. Anyone with an account may sign in; the pass says whether
 * they are a site admin, and the wiki makes admins its administrators.
 */
export const route = apiRoute('/api/wiki/sso', {
  GET: implement(
    wikiSsoApi,
    { auth: 'optional', rateLimit: 'read', query: wikiSsoQuery },
    async ({ userId, query }) => {
      const back = `/api/wiki/sso?state=${query.state}`;
      if (!userId) return redirect(`/login?callbackURL=${encodeURIComponent(back)}`);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, handle: true, username: true, isAdmin: true, bannedUntil: true },
      });
      if (!user) return redirect(`/login?callbackURL=${encodeURIComponent(back)}`);
      if (user.bannedUntil && user.bannedUntil > new Date()) {
        return redirect(wikiLogin('error=banned'));
      }
      const name = user.handle || user.username;
      if (!name) return redirect(wikiLogin('error=noname'));

      const secret = process.env.BETTER_AUTH_SECRET;
      if (!secret) {
        console.error('[wiki] BETTER_AUTH_SECRET is not set; cannot sign in to the wiki');
        return Response.json({ error: 'not_configured' }, { status: 503 });
      }
      const pass = signWikiPass(
        { sub: user.id, name, admin: user.isAdmin, state: query.state },
        wikiLoginKey(secret),
        Math.floor(Date.now() / 1000),
      );
      return redirect(wikiLogin(`pass=${encodeURIComponent(pass)}`));
    },
  ),
});
