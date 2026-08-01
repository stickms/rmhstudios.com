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
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'wishlist' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = wishlistEntrySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await addWish(session.user.id, parsed.data);
          return Response.json({ wished: true });
        },
      ),

      DELETE: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'wishlist' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = wishlistEntrySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await removeWish(session.user.id, parsed.data.entityType, parsed.data.entityId);
          return Response.json({ wished: false });
        },
      ),
    },
  },
});
