import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { FEED_ID, TOKEN_HEADER, syncBodySchema } from '@/lib/dunesday/sync-schema';
import { deletePlan, loadForOwner, savePlan, viewOf } from '@/lib/dunesday/sync.server';

/**
 * GET    /api/dunesday/sync/:feedId — the owner's copy (to restore on another device).
 * PUT    /api/dunesday/sync/:feedId — save the plan; may post progress to Discord.
 * DELETE /api/dunesday/sync/:feedId — stop syncing; the feeds stop working.
 *
 * Every method needs the edit token in `x-dunesday-token`. A wrong token and a
 * missing plan both answer 404, so the endpoint cannot be used to probe which
 * feed ids exist.
 */
async function owned(feedId: string, request: Request) {
  if (!FEED_ID.test(feedId)) return null;
  const row = await loadForOwner(feedId, request.headers.get(TOKEN_HEADER));
  return row || null;
}

const notFound = () =>
  Response.json({ error: 'That synced plan does not exist.' }, { status: 404 });

export const Route = createFileRoute('/api/dunesday/sync/$feedId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async ({ params, request }) => {
        const row = await owned(params.feedId, request);
        return row ? Response.json(viewOf(row)) : notFound();
      }),
      PUT: defineHandler(
        { auth: 'none', rateLimit: 'write', body: syncBodySchema },
        async ({ params, request, body }) => {
          const row = await owned(params.feedId, request);
          if (!row) return notFound();
          const { posted } = await savePlan(row, body.state, body.timeZone);
          return Response.json({ ok: true, posted });
        },
      ),
      DELETE: defineHandler({ auth: 'none', rateLimit: 'write' }, async ({ params, request }) => {
        const row = await owned(params.feedId, request);
        if (!row) return notFound();
        await deletePlan(row.feedId);
        return Response.json({ ok: true });
      }),
    },
  },
});
