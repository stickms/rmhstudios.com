import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { removeEntry } from '@/lib/history/history.server';

/** DELETE /api/history/:id — remove a single history entry. */
export const Route = createFileRoute('/api/history/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({}, async ({ params, session }) => {
        await removeEntry(session.user.id, params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
