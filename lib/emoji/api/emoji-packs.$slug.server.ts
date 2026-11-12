/** /api/emoji-packs/$slug — one pack with its items, honouring visibility. */
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { getPackBySlug } from '@/lib/emoji/packs.server';

export const route = apiRoute('/api/emoji-packs/$slug', {
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
    const pack = await getPackBySlug(params.slug, userId);
    return pack ? Response.json({ pack }) : notFound('Pack not found');
  }),
});
