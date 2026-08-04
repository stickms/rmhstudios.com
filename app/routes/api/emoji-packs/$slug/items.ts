/**
 * /api/emoji-packs/$slug/items — add or remove an item.
 *
 * Gated on `sticker-packs`: only members build packs. Adding an item also sends
 * the pack back to PENDING, so an approved-while-empty pack cannot be refilled
 * with anything afterwards.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { addItemSchema } from '@/lib/emoji/packs';
import { addItem, removeItem, PackError } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/emoji-packs/$slug/items')({
  server: {
    handlers: {
      POST: defineHandler(
        { feature: 'sticker-packs', rateLimit: 'upload', body: addItemSchema },
        async ({ userId, params, body }) => {
          try {
            return Response.json(
              { item: await addItem(userId, params.slug, body) },
              { status: 201 },
            );
          } catch (err) {
            if (err instanceof PackError) return apiError(err.message, err.status);
            throw err;
          }
        },
      ),
      DELETE: defineHandler(
        {
          feature: 'sticker-packs',
          rateLimit: 'write',
          body: z.object({ itemId: z.string().min(1).max(64) }),
        },
        async ({ userId, params, body }) => {
          try {
            await removeItem(userId, params.slug, body.itemId);
            return Response.json({ ok: true });
          } catch (err) {
            if (err instanceof PackError) return apiError(err.message, err.status);
            throw err;
          }
        },
      ),
    },
  },
});
