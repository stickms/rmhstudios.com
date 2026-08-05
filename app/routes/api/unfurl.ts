import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { SsrfError } from '@/lib/ssrf-guard.server';
import { unfurl } from '@/lib/unfurl/unfurl.server';

/**
 * GET /api/unfurl?url=… — link preview metadata for a pasted URL (B15).
 *
 * `auth: 'optional'` because a signed-out reader sees the same feed cards a
 * signed-in one does, and a link preview that only renders for members would be
 * a visible hole in the page. The rate limit is per-IP and deliberately tighter
 * than `read`: each miss is an outbound fetch.
 */
const querySchema = z.object({
  url: z.string().min(1).max(2048),
});

export const Route = createFileRoute('/api/unfurl')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'unfurl' },
          query: querySchema,
        },
        async ({ query }) => {
          let data;
          try {
            data = await unfurl(query.url);
          } catch (err) {
            if (err instanceof SsrfError) {
              return Response.json({ error: 'Disallowed URL' }, { status: 400 });
            }
            throw err;
          }

          if (!data) {
            return Response.json({ error: 'No preview available' }, { status: 404 });
          }

          return Response.json(data, {
            // Matches the server-side cache lifetime; a preview that changed
            // upstream is not worth a revalidation round-trip per viewer.
            headers: {
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
            },
          });
        },
      ),
    },
  },
});
