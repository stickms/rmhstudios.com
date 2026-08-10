import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { addRecap, ensureRecapSummary, listRecaps } from '@/lib/pf2ecal/recap.server';
import { recapSchema } from '@/lib/pf2ecal/types';

/**
 * GET  /api/pf2ecal/sessions/:id/recap — what happened, and the summary of it.
 * POST /api/pf2ecal/sessions/:id/recap — add your own account of the night.
 *
 * Separate from the board read because most sessions are never opened: putting
 * every word anyone wrote about thirty nights into the payload of every page
 * load, to render a panel behind a tap, is the wrong trade. The board carries a
 * count and the summary; this carries the entries.
 *
 * **GET is where the summary is generated.** There is no worker and no cron in
 * the web tier, so "summarise it after the session" happens the first time
 * somebody looks back at it — which is also the first moment the summary is
 * worth anything. `ensureRecapSummary` is keyed on the entries, so this is a
 * cheap read on every visit after the first, and a failed generation leaves the
 * previous summary in place rather than blanking it.
 *
 * `auth: 'none'` on the read, matching the rest of the board: anyone with the
 * link can already read the schedule and the notes. Writing needs an account,
 * like every other write here.
 */
export const Route = createFileRoute('/api/pf2ecal/sessions/$id/recap')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async ({ params }) => {
        const entries = await listRecaps(params.id);
        // Generating costs money and the entries are the substance, so a
        // failure here returns them with whatever summary was already stored.
        const summary = await ensureRecapSummary(params.id).catch((cause: unknown) => {
          console.error('[pf2ecal] recap summary failed:', cause);
          return null;
        });
        return Response.json({ entries, summary });
      }),

      POST: defineHandler(
        { rateLimit: 'write', body: recapSchema },
        async ({ params, userId, body }) => {
          const entry = await addRecap(params.id, userId, body.body);
          if (!entry) return Response.json({ error: 'Not found' }, { status: 404 });
          // Deliberately not regenerating the summary here. The writer is
          // mid-thought and may add another paragraph in a moment; the rewrite
          // happens on the next read, by which point the entries have settled.
          return Response.json({ entry }, { status: 201 });
        },
      ),
    },
  },
});
