import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { listNotesForAdmin } from '@/lib/context-notes/notes.server';

const query = z.object({ filter: z.enum(['shown', 'pending', 'hidden']).default('shown') });

/** GET /api/admin/context-notes?filter= — notes to review (X3). */
export const route = apiRoute('/api/admin/context-notes', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read', query }, async ({ query }) =>
    Response.json({ notes: await listNotesForAdmin(query.filter) }),
  ),
});
