import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateCollectionCover, type Viewer } from '@/lib/library/collections.server';
import { isSafeLibraryId } from '@/lib/library/keys';

/**
 * POST /api/library/collection/$id/cover — generate an AI cover image for a
 * collection (xAI / Grok) and store it. Owner-or-admin only; rate-limited since
 * each call is a paid image generation.
 */
async function getViewer(request: Request): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin) };
}

export const Route = createFileRoute('/api/library/collection/$id/cover')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });
          const viewer = await getViewer(request);
          if (!viewer) return Response.json({ error: 'You must be signed in.' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 10,
            windowMs: 60 * 60_000,
            prefix: 'library-collection-cover',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many cover generations. Try again later.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const result = await generateCollectionCover(viewer, params.id);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ ok: true, ...result.value });
        } catch (error) {
          console.error('Library collection cover error:', error);
          return Response.json({ error: 'Failed to generate cover.' }, { status: 500 });
        }
      },
    },
  },
});
