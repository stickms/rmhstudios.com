import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { listNotesForAdmin } from '@/lib/context-notes/notes.server';

const query = z.object({ filter: z.enum(['shown', 'pending', 'hidden']).default('shown') });

/** GET /api/admin/context-notes?filter= — notes to review (X3). */
export const Route = createFileRoute('/api/admin/context-notes/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', query }, async ({ query }) =>
        Response.json({ notes: await listNotesForAdmin(query.filter) }),
      ),
    },
  },
});
