import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listLiveSpaces } from '@/lib/spaces.server';

/**
 * GET /api/spaces/live — the "Live now" rail feed. Signed-out visitors see
 * public liveness; Spaces of a PRIVATE community are listed only to its members,
 * so the response is viewer-dependent and must never be shared-cached.
 */
export const Route = createFileRoute('/api/spaces/live')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', cache: { visibility: 'private', maxAge: 0 } },
        async ({ userId }) => {
          const spaces = await listLiveSpaces(20, userId);
          return Response.json({ spaces });
        },
      ),
    },
  },
});
