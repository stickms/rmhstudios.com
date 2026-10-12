import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteOwnStamp } from '@/lib/profile/stamps.server';

/** DELETE /api/stamps/$id — the creator deletes their own stamp; it leaves every wall (P5). */
export const Route = createFileRoute('/api/stamps/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteOwnStamp(userId, params.id);
        return ok
          ? Response.json({ success: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});
