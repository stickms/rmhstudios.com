/** /api/emoji-packs/$slug — one pack with its items, honouring visibility. */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { getPackBySlug } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/emoji-packs/$slug/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const pack = await getPackBySlug(params.slug, userId);
        return pack ? Response.json({ pack }) : notFound('Pack not found');
      }),
    },
  },
});
