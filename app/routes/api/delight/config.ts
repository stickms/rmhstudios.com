import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getDelightConfig } from '@/lib/delight/config.server';

/** GET /api/delight/config — { fools, hunt }: the April Fools flag and whether a hunt is live. Public, cached. */
export const Route = createFileRoute('/api/delight/config')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // Opt out of the 30 s micro-cache: an admin edit clears apiCache and must show at once.
          microCache: false,
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 60 },
        },
        async () => Response.json(await getDelightConfig()),
      ),
    },
  },
});
