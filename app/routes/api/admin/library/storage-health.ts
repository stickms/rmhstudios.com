import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getLibraryStorageHealth } from '@/lib/library/storage-health.server';

/**
 * GET /api/admin/library/storage-health — admin diagnostic: is library storage
 * durable, and are any uploaded objects missing right now? Admin only.
 */
async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/library/storage-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const health = await getLibraryStorageHealth();
        return Response.json(health);
      },
    },
  },
});
