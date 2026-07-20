import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json({ items: await listWishlist(session.user.id) });
        } catch (error) {
          console.error('Wishlist list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 60,
            windowMs: 60_000,
            prefix: 'wishlist',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = wishlistEntrySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await addWish(session.user.id, parsed.data);
          return Response.json({ wished: true });
        } catch (error) {
          console.error('Wishlist add error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 60,
            windowMs: 60_000,
            prefix: 'wishlist',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = wishlistEntrySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await removeWish(session.user.id, parsed.data.entityType, parsed.data.entityId);
          return Response.json({ wished: false });
        } catch (error) {
          console.error('Wishlist remove error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
