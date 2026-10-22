import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteReminder } from '@/lib/reminders/reminders.server';

/** DELETE /api/reminders/:id — cancel one of the caller's reminders (plan U7). */
export const Route = createFileRoute('/api/reminders/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const removed = await deleteReminder(userId, params.id);
        if (!removed) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true });
      }),
    },
  },
});
