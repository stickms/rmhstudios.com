import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { publishGuide, GameMetaError } from '@/lib/games/meta.server';

const schema = z.object({ published: z.boolean() });

/** POST /api/guides/:id/publish { published } — publish/unpublish (author). */
export const Route = createFileRoute('/api/guides/$id/publish')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, params, session }) => {
        const body = await request.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
        try {
          await publishGuide(session.user.id, params.id, parsed.data.published);
        } catch (e) {
          if (e instanceof GameMetaError)
            return Response.json({ error: e.message }, { status: 404 });
          throw e;
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
