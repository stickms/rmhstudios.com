import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { getProfile } from '@/lib/profile.server';

export const Route = createFileRoute('/api/profile/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'profile', message: 'Rate limited' },
        },
        async ({ request, params }) => {
          try {
            // Get viewer session (optional)
            let viewerId: string | null = null;
            let viewerIsAdmin = false;
            try {
              const session = await auth.api.getSession({ headers: request.headers });
              viewerId = session?.user?.id ?? null;
              viewerIsAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin ?? false;
            } catch {
              // Not logged in
            }

            const payload = await getProfile(params.id, { id: viewerId, isAdmin: viewerIsAdmin });
            if (!payload) return Response.json({ error: 'User not found' }, { status: 404 });
            return Response.json(payload);
          } catch (error) {
            console.error('Profile fetch error:', error);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
