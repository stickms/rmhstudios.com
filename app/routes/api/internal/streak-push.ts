import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authorizeInternalRequest } from '@/lib/internal-auth';
import { sendPushToUser } from '@/lib/push/send.server';

const bodySchema = z.object({
  reminders: z
    .array(z.object({ userId: z.string().min(1), current: z.number().int().nonnegative() }))
    .max(1000),
});

/**
 * POST /api/internal/streak-push — server-to-server web-push fan-out for streak
 * reminders. Called by the Go streak-saver worker (which writes the in-app
 * notification itself). No-ops when VAPID isn't configured. Authorized via the
 * shared internal secret.
 */
export const Route = createFileRoute('/api/internal/streak-push')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = authorizeInternalRequest(
          request.headers.get('x-internal-secret'),
          process.env.INTERNAL_API_SECRET,
        );
        if (!authz.ok) {
          return Response.json({ error: 'Unauthorized' }, { status: authz.status });
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: 'Invalid input' }, { status: 400 });
        }

        await Promise.all(
          parsed.data.reminders.map((r) =>
            sendPushToUser(r.userId, {
              title: 'Keep your streak alive 🔥',
              body: `Your ${r.current}-day streak ends soon — check in to keep it going.`,
              url: '/progress',
              tag: 'streak-reminder',
            }),
          ),
        );
        return Response.json({ ok: true });
      },
    },
  },
});
