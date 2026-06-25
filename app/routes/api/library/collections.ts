import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listCollectionsView, createCollection, type Viewer } from '@/lib/library/collections.server';

/**
 * /api/library/collections
 *   GET  — list all visible collections, resolved for display, with a per-row
 *          `canEdit` flag for the current viewer.
 *   POST — create a collection owned by the signed-in user ({ title, description }).
 */
async function getViewer(request: Request): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin) };
}

export const Route = createFileRoute('/api/library/collections')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const viewer = await getViewer(request);
          const collections = await listCollectionsView(viewer);
          return Response.json({ collections });
        } catch (error) {
          console.error('Library collections list error:', error);
          return Response.json({ error: 'Failed to load collections.' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const viewer = await getViewer(request);
          if (!viewer) return Response.json({ error: 'You must be signed in.' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 10 * 60_000, prefix: 'library-collection' });
          if (!allowed) return Response.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

          const body = (await request.json().catch(() => ({}))) as { title?: unknown; description?: unknown };
          const result = await createCollection(viewer, {
            title: String(body.title ?? ''),
            description: typeof body.description === 'string' ? body.description : '',
          });
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value, { status: 201 });
        } catch (error) {
          console.error('Library collection create error:', error);
          return Response.json({ error: 'Failed to create collection.' }, { status: 500 });
        }
      },
    },
  },
});
