/**
 * RMHHomes — listing search API.
 *
 * GET /api/homes/search?location=...&type=rent&minPrice=...&page=1
 *
 * Auth-gated and rate-limited. Delegates to the search orchestrator, which
 * fans out to every enabled provider (RentCast, Craigslist, sample) and merges
 * the results. Also returns the caller's saved-listing ids so the grid can show
 * the correct save state without a second request.
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { parseFilters } from '@/lib/homes/query';
import { searchListings } from '@/lib/homes/search.server';
import { savedListingIds } from '@/lib/homes/saved.server';

export const Route = createFileRoute('/api/homes/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 40,
            windowMs: 60_000,
            prefix: 'homes-search',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many searches. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const filters = parseFilters(new URL(request.url).searchParams);
          const [result, savedIds] = await Promise.all([
            searchListings(filters),
            savedListingIds(session.user.id),
          ]);

          return Response.json({ ...result, savedIds });
        } catch (error) {
          console.error('Homes search error:', error);
          return Response.json({ error: 'Search is unavailable right now.' }, { status: 502 });
        }
      },
    },
  },
});
