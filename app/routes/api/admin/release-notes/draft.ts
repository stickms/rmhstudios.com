import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { draftSchema } from '@/lib/devplatform/release-notes-schema';
import { aiAvailable, draftReleaseNote } from '@/lib/devplatform/ai.server';

/** POST — draft a changelog entry from pasted PR titles/bodies (not saved; a human edits it). */
export const Route = createFileRoute('/api/admin/release-notes/draft')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'ai', body: draftSchema },
        async ({ body }) => {
          if (!aiAvailable())
            return Response.json({ error: 'AI is not configured' }, { status: 503 });
          const draft = await draftReleaseNote(body.prs).catch(() => null);
          if (!draft)
            return Response.json({ error: 'The draft failed — try again' }, { status: 502 });
          return Response.json({ draft });
        },
      ),
    },
  },
});
