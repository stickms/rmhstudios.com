import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { suggestSchema } from '@/lib/delight/schema';
import { isTargetLocale, suggest } from '@/lib/delight/translate.server';

/** POST /api/translate/suggest { locale, ns, key, text } — one suggestion per member per string (re-sending edits it). */
export const Route = createFileRoute('/api/translate/suggest/')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'translate-suggest', scope: 'user' },
          body: suggestSchema,
        },
        async ({ userId, body }) => {
          if (!isTargetLocale(body.locale))
            return Response.json({ error: 'Unknown locale' }, { status: 400 });
          const r = await suggest(userId, body);
          if (r === 'ok') return Response.json({ ok: true }, { status: 201 });
          const error = {
            'unknown-string': 'That string does not exist',
            placeholders: 'Keep the {{placeholders}} exactly as in English',
            accepted: 'Your suggestion was already accepted',
          }[r];
          return Response.json({ error }, { status: r === 'unknown-string' ? 404 : 400 });
        },
      ),
    },
  },
});
