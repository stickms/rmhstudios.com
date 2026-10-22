import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cached } from '@/lib/cached.server';
import { oncallClient } from '@/lib/oncall/client.server';
import type { OncallApiResponse, WatchdogOverview } from '@/lib/oncall/dashboard';

/**
 * GET /api/admin/oncall — current alarms and heartbeats from the on-call
 * watchdog, for /admin/alarms. Admin only: the watchdog's data includes who
 * acked what and the internals of every incident.
 *
 * The request to the watchdog is HMAC-signed with ONCALL_SIGNING_SECRET here on
 * the server; the secret never reaches the browser. Cached 10 s so an open page
 * (it polls) can't flood the watchdog.
 */
export const Route = createFileRoute('/api/admin/oncall')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', label: 'admin-oncall' }, async () => {
        const headers = { 'Cache-Control': 'no-store' };
        const client = oncallClient();
        if (!client) {
          return Response.json({ ok: false, error: 'not_configured' } satisfies OncallApiResponse, {
            headers,
          });
        }
        try {
          const overview = await cached('oncall:overview', 10_000, () =>
            client.get<WatchdogOverview>('/v1/alarms'),
          );
          // `?? []`: a watchdog older than the heartbeats field answers without it.
          const body: OncallApiResponse = {
            ok: true,
            now: overview.now ?? Date.now(),
            alarms: overview.alarms ?? [],
            heartbeats: overview.heartbeats ?? [],
          };
          return Response.json(body, { headers });
        } catch (err) {
          console.error('[oncall] watchdog unreachable:', (err as Error)?.message ?? err);
          return Response.json({ ok: false, error: 'unreachable' } satisfies OncallApiResponse, {
            headers,
          });
        }
      }),
    },
  },
});
