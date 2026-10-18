import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteKudos } from '@/lib/gifting/kudos.server';

/** DELETE /api/kudos/:id — the recipient or the sender removes a note. */
export const Route = createFileRoute('/api/kudos/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        if (!(await deleteKudos(userId, params.id))) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
