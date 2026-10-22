import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { adminAdd, adminList } from '@/lib/posts-plus/qotd.server';
import { qotdAddSchema } from '@/lib/posts-plus/schema';

/**
 * GET  /api/admin/qotd - the prompt queue, pinned future prompts, and recent ones (X4).
 * POST /api/admin/qotd { text, dayKey? } - add a prompt to the queue (or pin it to a day).
 */
export const Route = createFileRoute('/api/admin/qotd/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json(await adminList(), { headers: { 'Cache-Control': 'private, no-store' } }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: qotdAddSchema },
        async ({ userId, body }) => {
          const res = await adminAdd(userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ id: res.id }, { status: 201 });
        },
      ),
    },
  },
});
