import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listRemindersApi, setReminderApi } from '@/lib/reminders/reminders.contract';
import { createReminderSchema } from '@/lib/reminders/schema';
import { listPendingReminders, setReminder } from '@/lib/reminders/reminders.server';

/**
 * GET  /api/reminders — the caller's pending reminders, soonest first.
 * POST /api/reminders — set (or move) a reminder for one target (plan U7).
 */
export const route = apiRoute('/api/reminders', {
  GET: implement(listRemindersApi, { rateLimit: 'read' }, async ({ userId }) => {
    const reminders = await listPendingReminders(userId);
    return Response.json({ reminders }, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
  POST: implement(
    setReminderApi,
    { rateLimit: 'write', body: createReminderSchema },
    async ({ userId, body }) => {
      const result = await setReminder(userId, body);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ reminder: result.reminder }, { status: 201 });
    },
  ),
});
