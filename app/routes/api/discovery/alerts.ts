import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { alertCreateSchema, alertDeleteQuery } from '@/lib/discovery/schema';
import { addAlert, listAlerts, removeAlert } from '@/lib/discovery/alerts.server';

/** GET / POST / DELETE ?id= /api/discovery/alerts — the caller's keyword alerts (A6). */
export const Route = createFileRoute('/api/discovery/alerts')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { alerts: await listAlerts(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: alertCreateSchema },
        async ({ userId, body }) => {
          const res = await addAlert(userId, body.query);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ alert: res.alert }, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', query: alertDeleteQuery },
        async ({ userId, query }) => {
          await removeAlert(userId, query.id);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
