import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { releaseNoteSchema } from '@/lib/devplatform/release-notes-schema';
import { createNote, listAllNotes } from '@/lib/devplatform/release-notes.server';

/** GET lists every note (drafts included); POST saves one (publish: true to go live). */
export const Route = createFileRoute('/api/admin/release-notes/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json(
          { notes: await listAllNotes() },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: releaseNoteSchema },
        async ({ userId, body }) =>
          Response.json({ note: await createNote(userId, body) }, { status: 201 }),
      ),
    },
  },
});
