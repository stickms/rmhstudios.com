import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listPublishedNotes } from '@/lib/devplatform/release-notes.server';

/** GET /api/release-notes — published changelog entries (public). */
export const route = apiRoute('/api/release-notes', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: 'read',
      cache: { visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 600 },
    },
    async () => Response.json({ notes: await listPublishedNotes() }),
  ),
});
