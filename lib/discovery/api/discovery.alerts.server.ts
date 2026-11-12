import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/discovery/discovery.contract';
import { alertCreateSchema, alertDeleteQuery } from '@/lib/discovery/schema';
import { addAlert, listAlerts, removeAlert } from '@/lib/discovery/alerts.server';

/** GET / POST / DELETE ?id= /api/discovery/alerts — the caller's keyword alerts (A6). */
export const route = apiRoute('/api/discovery/alerts', {
  GET: implement(C.listDiscoveryAlertsApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(
      { alerts: await listAlerts(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
  POST: implement(
    C.addDiscoveryAlertApi,
    { rateLimit: 'write', body: alertCreateSchema },
    async ({ userId, body }) => {
      const res = await addAlert(userId, body.query);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ alert: res.alert }, { status: 201 });
    },
  ),
  DELETE: implement(
    C.removeDiscoveryAlertApi,
    { rateLimit: 'write', query: alertDeleteQuery },
    async ({ userId, query }) => {
      await removeAlert(userId, query.id);
      return Response.json({ ok: true });
    },
  ),
});
