import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { logAdminAction } from '@/lib/admin-audit.server';
import { oncallClient } from '@/lib/oncall/client.server';
import { alarmIdOf, isRemediationId, remediationsFor } from '@/lib/oncall/remediations';
import { availability, RemediationError, runRemediation } from '@/lib/oncall/remediate.server';
import type { WatchdogOverview } from '@/lib/oncall/dashboard';

/**
 * POST /api/admin/oncall/remediate — run one of the actions an alarm offers (re-run a failed deploy,
 * requeue dead outbox events, retry failed jobs).
 *
 * The browser sends only the alarm key and an action id. Here the alarm is looked up on the watchdog
 * (it must exist and still be firing), the action must be registered for that alarm's id, and the
 * server must have what it needs (availability). Every run is audited, success or not.
 */
const schema = z.object({
  key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/),
  action: z.string().max(64),
});

export const route = apiRoute('/api/admin/oncall/remediate', {
  POST: implement(
    C.remediateAdminOncallApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' }, body: schema, label: 'admin-oncall-remediate' },
    async ({ session, body }) => {
      const client = oncallClient();
      if (!client) return Response.json({ ok: false, error: 'The watchdog is not configured.' });
      if (!isRemediationId(body.action)) return Response.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
      const action = body.action;

      let overview: WatchdogOverview;
      try {
        overview = await client.get<WatchdogOverview>('/v1/alarms');
      } catch {
        return Response.json({ ok: false, error: 'The watchdog did not answer.' });
      }
      const alarm = overview.alarms.find((a) => a.key === body.key);
      if (!alarm) return Response.json({ ok: false, error: 'That alarm no longer exists.' }, { status: 404 });
      if (alarm.state !== 'firing') return Response.json({ ok: false, error: 'That alarm is already resolved.' });
      if (!remediationsFor(alarmIdOf(alarm.id)).some((r) => r.id === action)) {
        return Response.json({ ok: false, error: 'That action does not apply to this alarm.' }, { status: 400 });
      }
      const avail = availability()[action];
      if (!avail.available) return Response.json({ ok: false, error: avail.reason ?? 'Not available.' });

      try {
        const message = await runRemediation(action, session.user.id);
        await logAdminAction(session.user.id, `oncall.${action}`, {
          targetType: 'oncall_alarm',
          targetId: body.key,
          detail: message,
        });
        return Response.json({ ok: true, message });
      } catch (err) {
        const reason = err instanceof RemediationError ? err.message : 'It failed. Check the server log.';
        console.error(`[oncall] remediation ${action} failed:`, (err as Error)?.message ?? err);
        await logAdminAction(session.user.id, `oncall.${action}.failed`, {
          targetType: 'oncall_alarm',
          targetId: body.key,
          detail: reason,
        });
        return Response.json({ ok: false, error: reason });
      }
    },
  ),
});
