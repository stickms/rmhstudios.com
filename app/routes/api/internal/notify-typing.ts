import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { notifyUser } from '@/lib/message-events';
import { authorizeInternalRequest } from '@/lib/internal-auth';

const bodySchema = z.object({
  userId: z.string().min(1),
  typing: z.object({
    conversationId: z.string(),
    senderId: z.string(),
    isTyping: z.boolean(),
  }),
});

/** POST /api/internal/notify-typing — server-to-server typing indicator for bot DMs. */
export const Route = createFileRoute('/api/internal/notify-typing')({
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
          type: 'typing',
          typing: parsed.data.typing,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
