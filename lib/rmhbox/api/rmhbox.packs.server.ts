import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { createPackSchema } from '@/lib/party/packs-schema';
import { createPack, listPacks } from '@/lib/party/packs.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';

/**
 * GET  /api/rmhbox/packs — featured shelf, newest community packs, the caller's own.
 * POST /api/rmhbox/packs — author a prompt pack (R2); returns its share code.
 */
export const route = apiRoute('/api/rmhbox/packs', {
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, isAdmin }) => {
    const data = await listPacks(userId, isAdmin);
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
  POST: defineHandler({ rateLimit: 'write', body: createPackSchema }, async ({ userId, body }) => {
    // s15-17: a pack is text other members read, so a timeout on replying holds for making one.
    const restricted = await restrictionResponse(userId, 'comment');
    if (restricted) return restricted;
    const r = await createPack(userId, body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ pack: r.pack }, { status: 201 });
  }),
});
