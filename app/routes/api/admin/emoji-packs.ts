/**
 * GET /api/admin/emoji-packs — the emoji & sticker pack review queue. Admin only.
 *
 * Pending packs, oldest edit first, each with its owner and a preview of its
 * items. Decisions go to `POST /api/admin/emoji-packs/$id`.
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listPendingPacks } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/admin/emoji-packs')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin' }, async () =>
        Response.json({ packs: await listPendingPacks() }),
      ),
    },
  },
});
