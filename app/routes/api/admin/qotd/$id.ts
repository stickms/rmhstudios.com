import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { adminRemove } from '@/lib/posts-plus/qotd.server';

/** DELETE /api/admin/qotd/$id - remove a prompt that has not run yet (X4). */
export const Route = createFileRoute('/api/admin/qotd/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) => {
        const res = await adminRemove(params.id);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
