import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { topArtists, type ArtistSummary } from '@/lib/slice-it/library-query.server';

/**
 * L15 — the artist facet.
 *
 * The library shows a row of artist chips above the results. Building that from
 * the page of songs already loaded would be wrong in the obvious way: it would
 * list the artists on page 1 rather than the artists in the library, and it
 * would change every time you scrolled.
 *
 * So it is one grouped aggregate over the whole public table, served here
 * rather than folded into `/api/slice-it/songs`. Separate because it is
 * cacheable and the song list is not — the facet answers the same thing for
 * every viewer and changes only on upload, while the list carries per-viewer
 * lamps and likes in every row.
 */
const QueryZ = z.object({
  limit: z.coerce.number().int().min(1).max(40).default(12),
});

export const Route = createFileRoute('/api/slice-it/songs/artists')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', query: QueryZ, rateLimit: 'read' }, async ({ query }) => {
        const artists = await topArtists(query.limit);
        return new Response(JSON.stringify({ artists } satisfies { artists: ArtistSummary[] }), {
          headers: {
            'Content-Type': 'application/json',
            // Viewer-independent by construction — there is nothing
            // per-account in the response — so it is safe to cache publicly.
            // Five minutes: an upload should show up in the facet on the same
            // visit that made it, not on the next deploy.
            'Cache-Control': 'public, max-age=60, s-maxage=300',
          },
        });
      }),
    },
  },
});
