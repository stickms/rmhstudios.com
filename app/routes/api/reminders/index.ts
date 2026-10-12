import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createReminderSchema } from '@/lib/reminders/schema';
import { listPendingReminders, setReminder } from '@/lib/reminders/reminders.server';

/**
 * GET  /api/reminders — the caller's pending reminders, soonest first.
 * POST /api/reminders — set (or move) a reminder for one target (plan U7).
 */
export const Route = createFileRoute('/api/reminders/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const reminders = await listPendingReminders(userId);
        return Response.json({ reminders }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: createReminderSchema },
        async ({ userId, body }) => {
          const result = await setReminder(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ reminder: result.reminder }, { status: 201 });
        },
      ),
    },
  },
});
