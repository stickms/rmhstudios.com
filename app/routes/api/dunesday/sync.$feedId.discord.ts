import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import {
  FEED_ID,
  TOKEN_HEADER,
  discordSettingsSchema,
  discordTestSchema,
} from '@/lib/dunesday/sync-schema';
import { loadForOwner, saveDiscord, sendTest } from '@/lib/dunesday/sync.server';

/**
 * PUT  /api/dunesday/sync/:feedId/discord — save webhook + post preferences.
 * POST /api/dunesday/sync/:feedId/discord — send a test message.
 *
 * The webhook is validated against Discord's own hosts before it is stored and
 * only ever returned masked. The test endpoint posts to a URL the caller just
 * typed, so it rides the `'ai'`-tight bucket rather than `'write'`: it is the
 * one route here that makes an outbound request on demand.
 */
async function owned(feedId: string, request: Request) {
  if (!FEED_ID.test(feedId)) return null;
  return (await loadForOwner(feedId, request.headers.get(TOKEN_HEADER))) || null;
}

const notFound = () =>
  Response.json({ error: 'That synced plan does not exist.' }, { status: 404 });

export const Route = createFileRoute('/api/dunesday/sync/$feedId/discord')({
  server: {
    handlers: {
      PUT: defineHandler(
        { auth: 'none', rateLimit: 'write', body: discordSettingsSchema },
        async ({ params, request, body }) => {
          const row = await owned(params.feedId, request);
          if (!row) return notFound();
          const result = await saveDiscord(row, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
          return Response.json(result.view);
        },
      ),
      POST: defineHandler(
        { auth: 'none', rateLimit: 'ai', body: discordTestSchema },
        async ({ params, request, body }) => {
          const row = await owned(params.feedId, request);
          if (!row) return notFound();
          const result = await sendTest(row, body.webhookUrl);
          return result.ok
            ? Response.json({ ok: true })
            : Response.json(
                { error: result.error ?? 'Discord rejected the message.' },
                { status: 400 },
              );
        },
      ),
    },
  },
});
