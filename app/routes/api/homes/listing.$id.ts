/**
 * RMHHomes — single listing detail API.
 *
 * GET /api/homes/listing/<source:externalId>
 *
 * Resolves a listing from the shared search cache (populated by recent
 * searches), falling back to the owning provider or the caller's saved
 * snapshot. Returns 404 when nothing can resolve it.
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { resolveListing } from '@/lib/homes/search.server';
import { listSavedListings } from '@/lib/homes/saved.server';

export const Route = createFileRoute('/api/homes/listing/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 60,
            windowMs: 60_000,
            prefix: 'homes-listing',
          });
          if (!allowed) {
            return Response.json({ error: 'Too many requests.' }, { status: 429 });
          }

          const id = decodeURIComponent(params.id);
          let listing = await resolveListing(id);
          let saved = false;

          if (!listing) {
            // Fall back to the user's saved snapshot.
            const savedRows = await listSavedListings(session.user.id);
            const match = savedRows.find((r) => r.listingId === id);
            if (match) {
              listing = match.listing;
              saved = true;
            }
          }

          if (!listing) {
            return Response.json({ error: 'Listing not found' }, { status: 404 });
          }

          return Response.json({ listing, saved });
        } catch (error) {
          console.error('Homes listing detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
