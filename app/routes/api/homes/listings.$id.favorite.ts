/**
 * RMHHomes — favorite toggle.
 *
 *   POST   /api/homes/listings/$id/favorite   → favorite
 *   DELETE /api/homes/listings/$id/favorite   → unfavorite
 */
import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/homes/homes.contract';
import { favorite, unfavorite } from '@/lib/homes/listings.server';

export const Route = createFileRoute('/api/homes/listings/$id/favorite')({
  server: {
    handlers: {
      POST: implement(
        C.favoriteHomeListingApi,
        {
          rateLimit: {
            limit: 60,
            windowMs: 60_000,
            prefix: 'homes-favorite',
            message: 'Too many requests.',
          },
        },
        async ({ params, session }) => {
          const ok = await favorite(session.user.id, params.id);
          if (!ok) return Response.json({ error: 'Listing not found' }, { status: 404 });
          return Response.json({ ok: true });
        },
      ),

      DELETE: implement(C.unfavoriteHomeListingApi, {}, async ({ params, session }) => {
        await unfavorite(session.user.id, params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
