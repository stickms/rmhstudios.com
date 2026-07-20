import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { removeEntry } from '@/lib/history/history.server';

/** DELETE /api/history/:id — remove a single history entry. */
export const Route = createFileRoute('/api/history/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          await removeEntry(session.user.id, params.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('History entry delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
