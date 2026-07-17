import { createFileRoute } from '@tanstack/react-router';

/**
 * GET /api/health — cheap liveness probe.
 *
 * perf audit §1.6: the container healthcheck used to curl `/`, which renders the
 * full homepage through SSR on the single web event loop every 30s. This endpoint
 * returns 200 immediately without touching the database, the session, or the
 * renderer, so liveness checks cost effectively nothing. It intentionally does NOT
 * verify downstream dependencies (DB/Redis) — it answers "is this Node process
 * accepting requests", which is what the restart/hotswap gate needs.
 */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        new Response('ok', {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }),
    },
  },
});
