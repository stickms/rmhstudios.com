import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listPublicWishlist } from '@/lib/wishlist/wishlist.server';

/** GET /api/users/:id/wishlist — another user's public wishlist (404 if private). */
export const Route = createFileRoute('/api/users/$id/wishlist')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const items = await listPublicWishlist(params.id);
        if (items === null) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ items });
      }),
    },
  },
});
