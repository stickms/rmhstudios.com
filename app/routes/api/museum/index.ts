import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listEras } from '@/lib/delight/museum.server';

/** GET /api/museum — the site-era timeline, newest first. Public. */
export const Route = createFileRoute('/api/museum/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // Opt out of the 30 s micro-cache: writes clear apiCache (museum.server) and must show at once.
          microCache: false,
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 300 },
        },
        async () => Response.json({ eras: await listEras() }),
      ),
    },
  },
});
