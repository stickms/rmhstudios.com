import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listAllBooksForAdmin } from '@/lib/library/library.server';

/**
 * GET /api/admin/library — every library book, including hidden ones, for the
 * admin edit manager. Admin only.
 */
async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/library/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const books = await listAllBooksForAdmin();
        return Response.json({ books });
      },
    },
  },
});
