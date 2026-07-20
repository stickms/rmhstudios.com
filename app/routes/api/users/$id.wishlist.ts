import { createFileRoute } from '@tanstack/react-router';
import { listPublicWishlist } from '@/lib/wishlist/wishlist.server';

/** GET /api/users/:id/wishlist — another user's public wishlist (404 if private). */
export const Route = createFileRoute('/api/users/$id/wishlist')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const items = await listPublicWishlist(params.id);
          if (items === null) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ items });
        } catch (error) {
          console.error('Public wishlist error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
