import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { matchForListing } from '@/lib/homes/roommate.server';

/** GET /api/homes/listings/$id/roommate — the viewer's compatibility % with the poster. */
export const Route = createFileRoute('/api/homes/listings/$id/roommate')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'homes-roommate-match' } },
        async ({ userId, params }) =>
          Response.json(await matchForListing(userId, params.id!), {
            headers: { 'Cache-Control': 'private, no-store' },
          }),
      ),
    },
  },
});
