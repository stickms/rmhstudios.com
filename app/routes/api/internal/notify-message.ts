import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { notifyUser, type MessagePayload } from '@/lib/message-events';
import { authorizeInternalRequest } from '@/lib/internal-auth';

const bodySchema = z.object({
  userId: z.string().min(1),
  message: z.object({
    id: z.string(),
    conversationId: z.string(),
    content: z.string(),
    senderId: z.string(),
    read: z.boolean(),
    createdAt: z.string(),
  }),
});

/** POST /api/internal/notify-message — server-to-server SSE fan-out for bot DMs. */
export const Route = createFileRoute('/api/internal/notify-message')({
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

        notifyUser(parsed.data.userId, {
          type: 'new-message',
          message: parsed.data.message as MessagePayload,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
