import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { memoriesSchema } from '@/lib/discovery/schema';
import { getMemoriesOptIn, setMemoriesOptIn } from '@/lib/discovery/memories.server';

/** GET / PUT /api/discovery/memories — opt in or out of "On this day" notifications (A5). */
export const Route = createFileRoute('/api/discovery/memories')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { enabled: await getMemoriesOptIn(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      PUT: defineHandler({ rateLimit: 'write', body: memoriesSchema }, async ({ userId, body }) => {
        await setMemoriesOptIn(userId, body.enabled);
        return Response.json({ enabled: body.enabled });
      }),
    },
  },
});
