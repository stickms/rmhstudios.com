import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { cancelReminderApi } from '@/lib/reminders/reminders.contract';
import { deleteReminder } from '@/lib/reminders/reminders.server';

/** DELETE /api/reminders/:id — cancel one of the caller's reminders (plan U7). */
export const route = apiRoute('/api/reminders/$id', {
  DELETE: implement(cancelReminderApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const removed = await deleteReminder(userId, params.id);
    if (!removed) return Response.json({ error: 'Not found' }, { status: 404 });
    return { ok: true as const };
  }),
});
