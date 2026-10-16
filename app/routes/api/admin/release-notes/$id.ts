import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { releaseNotePatchSchema } from '@/lib/devplatform/release-notes';
import { deleteNote, updateNote } from '@/lib/devplatform/release-notes.server';

export const Route = createFileRoute('/api/admin/release-notes/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: releaseNotePatchSchema },
        async ({ params, body }) => {
          const note = await updateNote(params.id, body);
          return note
            ? Response.json({ note })
            : Response.json({ error: 'Not found' }, { status: 404 });
        },
      ),
      DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) =>
        (await deleteNote(params.id))
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
