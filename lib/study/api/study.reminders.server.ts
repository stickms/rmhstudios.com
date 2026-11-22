import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getReminderApi, saveReminderApi } from '@/lib/study/reminders.contract';
import { saveReminderBody } from '@/lib/study/reminders-schema';
import { getReminder, saveReminder } from '@/lib/study/reminders.server';

/** /api/study/reminders — the member's daily "cards are due" reminder: read and save. */
export const route = apiRoute('/api/study/reminders', {
  GET: implement(getReminderApi, { rateLimit: 'read' }, async ({ userId }) => ({
    reminder: await getReminder(userId),
  })),
  PUT: implement(saveReminderApi, { rateLimit: 'write', body: saveReminderBody }, async ({ userId, body }) => ({
    reminder: await saveReminder(userId, body),
  })),
});
