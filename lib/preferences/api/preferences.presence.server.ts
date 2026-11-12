import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { getPresencePrefs } from '@/lib/settings/prefs.server';
import { presencePrivacySchema } from '@/lib/presence-types-schema';
import { getPresencePrefsApi } from '@/lib/preferences/preferences.contract';
import { setPresencePrefsApi } from '@/lib/preferences/preferences.contract';

/**
 * GET /api/preferences/presence — the caller's presence visibility + detail.
 * PUT /api/preferences/presence — save them (partial upsert of UserProfile).
 *
 * Controls who sees the user in the Friends rail / activity line (§9). The
 * profile row is created on demand so a new user can set this before they have
 * one.
 */
export const route = apiRoute('/api/preferences/presence', {
  GET: implement(getPresencePrefsApi, {}, async ({ session }) =>
    Response.json(await getPresencePrefs(session.user.id)),
  ),
  PUT: implement(
    setPresencePrefsApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'presence-prefs' },
      body: presencePrivacySchema,
    },
    async ({ session, body }) => {
      const data = {
        ...(body.presenceVisibility !== undefined
          ? { presenceVisibility: body.presenceVisibility }
          : {}),
        ...(body.presenceDetail !== undefined ? { presenceDetail: body.presenceDetail } : {}),
      };
      const row = await prisma.userProfile.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, ...data },
        update: data,
        select: { presenceVisibility: true, presenceDetail: true },
      });
      return Response.json({
        presenceVisibility: row.presenceVisibility,
        presenceDetail: row.presenceDetail,
      });
    },
  ),
});
