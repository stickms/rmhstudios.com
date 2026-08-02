import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { wishlistEntrySchema } from '@/lib/wishlist/types';
import { addWish, removeWish, listWishlist } from '@/lib/wishlist/wishlist.server';

/**
 * GET    /api/wishlist — the caller's wishlist.
 * POST   /api/wishlist { entityType, entityId, targetPrice? } — add (idempotent).
 * DELETE /api/wishlist { entityType, entityId } — remove (idempotent).
 */
export const Route = createFileRoute('/api/wishlist/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json({ items: await listWishlist(session.user.id) });
      }),

      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'wishlist' },
          body: wishlistEntrySchema,
        },
        async ({ session, body }) => {
          await addWish(session.user.id, body);
          return Response.json({ wished: true });
        },
      ),

      DELETE: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'wishlist' },
          body: wishlistEntrySchema,
        },
        async ({ session, body }) => {
          await removeWish(session.user.id, body.entityType, body.entityId);
          return Response.json({ wished: false });
        },
      ),
    },
  },
});
