import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { addItem, removeItem, reorderItems, type Viewer } from '@/lib/library/collections.server';
import { isSafeLibraryId } from '@/lib/library/keys';

/**
 * /api/library/collection/$id/items
 *   POST   — add a book to the collection ({ bookSlug }).
 *   DELETE — remove a book from the collection ({ bookSlug }).
 *   PATCH  — reorder the collection's books ({ slugs: string[] }).
 * Owner-or-admin only; adding also requires the viewer to own the book (data layer).
 */
async function getViewer(request: Request): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin) };
}

function bookSlugFrom(body: unknown): string {
  const slug = (body as { bookSlug?: unknown })?.bookSlug;
  return typeof slug === 'string' ? slug : '';
}

export const Route = createFileRoute('/api/library/collection/$id/items')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });
          const viewer = await getViewer(request);
          const slug = bookSlugFrom(await request.json().catch(() => ({})));
          if (!slug) return Response.json({ error: 'No book specified.' }, { status: 400 });
          const result = await addItem(viewer, params.id, slug);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Library collection add-item error:', error);
          return Response.json({ error: 'Failed to add book.' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });
          const viewer = await getViewer(request);
          const slug = bookSlugFrom(await request.json().catch(() => ({})));
          if (!slug) return Response.json({ error: 'No book specified.' }, { status: 400 });
          const result = await removeItem(viewer, params.id, slug);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Library collection remove-item error:', error);
          return Response.json({ error: 'Failed to remove book.' }, { status: 500 });
        }
      },

      PATCH: async ({ request, params }) => {
        try {
          if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });
          const viewer = await getViewer(request);
          const body = (await request.json().catch(() => ({}))) as { slugs?: unknown };
          const slugs = Array.isArray(body.slugs) ? body.slugs.filter((s): s is string => typeof s === 'string') : [];
          if (slugs.length === 0 || slugs.length > 5000) return Response.json({ error: 'Invalid order.' }, { status: 400 });
          const result = await reorderItems(viewer, params.id, slugs);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Library collection reorder error:', error);
          return Response.json({ error: 'Failed to reorder.' }, { status: 500 });
        }
      },
    },
  },
});
