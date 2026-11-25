import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { logAdminAction } from '@/lib/admin-audit.server';
import { oncallClient } from '@/lib/oncall/client.server';

/**
 * POST /api/admin/oncall/alarm — acknowledge, escalate or resolve an alarm from the admin panel.
 *
 * The watchdog owns alarm state: this forwards the click (signed with ONCALL_SIGNING_SECRET, which
 * never reaches the browser) and the watchdog applies the same change a Discord button would, edits
 * the alert and posts the reply. A refusal ("already acknowledged") comes back as `{ ok: false }`.
 */
const schema = z.object({
  key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/),
  action: z.enum(['ack', 'escalate', 'resolve']),
});

const DONE = {
  ack: 'Acknowledged. Re-pages stop.',
  escalate: 'Escalated to Sev1. Everyone is paged.',
  resolve: 'Resolved.',
} as const;

export const route = apiRoute('/api/admin/oncall/alarm', {
  POST: implement(
    C.actOnAdminOncallAlarmApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' }, body: schema, label: 'admin-oncall-alarm' },
    async ({ session, body }) => {
      const client = oncallClient();
      if (!client) return Response.json({ ok: false, error: 'The watchdog is not configured.' });
      try {
        const res = await client.postJson<{ ok: boolean; error?: string }>(
          `/v1/alarms/${encodeURIComponent(body.key)}/${body.action}`,
          { by: session.user.id, name: session.user.name ?? 'an admin' },
        );
        if (!res.ok) return Response.json({ ok: false, error: res.error ?? 'The watchdog refused.' });
        await logAdminAction(session.user.id, `oncall.${body.action}`, {
          targetType: 'oncall_alarm',
          targetId: body.key,
        });
        return Response.json({ ok: true, message: DONE[body.action] });
      } catch (err) {
        console.error('[oncall] alarm action failed:', (err as Error)?.message ?? err);
        return Response.json({ ok: false, error: 'The watchdog did not answer. Use the buttons in Discord.' });
      }
    },
  ),
});
