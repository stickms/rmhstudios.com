import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { adminPackSchema } from '@/lib/party/packs-schema';
import { adminSetPack, deletePack } from '@/lib/party/packs.server';

/**
 * DELETE /api/rmhbox/packs/:id — owner (or admin) removes a pack.
 * PATCH  /api/rmhbox/packs/:id — admin: toggle `featured` / `hidden` (refused for a removed pack).
 */
export const route = apiRoute('/api/rmhbox/packs/$id', {
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, isAdmin, params }) => {
    const ok = await deletePack(userId, params.id, isAdmin);
    return ok
      ? Response.json({ ok: true })
      : Response.json({ error: 'Not found' }, { status: 404 });
  }),
  PATCH: defineHandler(
    { auth: 'admin', rateLimit: 'write', body: adminPackSchema },
    async ({ params, body }) => {
      const done = await adminSetPack(params.id, body);
      // A pack a moderator removed stays removed: it cannot be unhidden or featured.
      if (done === 'removed') return Response.json(refusalBody('FORBIDDEN'), { status: 403 });
      return done === 'ok' ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
