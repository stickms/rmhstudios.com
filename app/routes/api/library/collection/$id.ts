import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { updateCollection, deleteCollection, type Viewer } from '@/lib/library/collections.server';
import { isSafeLibraryId } from '@/lib/library/keys';

/**
 * /api/library/collection/$id
 *   PATCH  — rename / re-describe a collection ({ title?, description? }).
 *   DELETE — remove a collection (and its items, by cascade).
 * Owner-or-admin only (enforced in the data layer).
 */
async function getViewer(request: Request): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin) };
}

export const Route = createFileRoute('/api/library/collection/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });
          const viewer = await getViewer(request);
          const body = (await request.json().catch(() => ({}))) as { title?: unknown; description?: unknown };
          const result = await updateCollection(viewer, params.id, {
            title: typeof body.title === 'string' ? body.title : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
          });
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ ok: true, ...result.value });
        } catch (error) {
          console.error('Library collection update error:', error);
          return Response.json({ error: 'Failed to update collection.' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });
          const viewer = await getViewer(request);
          const result = await deleteCollection(viewer, params.id);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Library collection delete error:', error);
          return Response.json({ error: 'Failed to delete collection.' }, { status: 500 });
        }
      },
    },
  },
});
