import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getPlusView } from '@/lib/profile/plus.server';

/**
 * GET /api/profile/$id/plus — a member's public identity extras (pronouns,
 * opt-in timezone, /now text, counter switch). Everything here is something the
 * member chose to publish; the same body for every caller, so it is shared-cache
 * safe. Used by the /now and counter modules and by the DM header's local time.
 * `$id` is the user id.
 */
export const Route = createFileRoute('/api/profile/$id/plus')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 30, staleWhileRevalidate: 120 },
        },
        async ({ params }) => Response.json(await getPlusView(params.id)),
      ),
    },
  },
});
