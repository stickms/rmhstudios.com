import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getWatchState } from '@/lib/sohumtracker/activity.server';
import { DEFAULT_HISTORY_DAYS, MAX_HISTORY_DAYS } from '@/lib/sohumtracker/config';
import { toCsv, toDossierJson } from '@/lib/sohumtracker/export.server';

/**
 * GET /api/sohumtracker/export — the dossier as a file.
 *
 * `?format=csv` is one row per day with every measured column, which is what a
 * spreadsheet wants; `?format=json` is the same rows plus the summaries and the
 * derived readings, which is what a script wants. Both are DOWNLOADS
 * (`Content-Disposition: attachment`) rather than something to read in a tab —
 * the page is the thing to read.
 *
 * Why it exists: everything on the page is an assertion about somebody, and an
 * assertion nobody can check is just a claim. The export is the working. It also
 * costs nothing to serve — it is the same query the page already runs, rendered
 * differently.
 *
 * `auth: 'none'` for the same reason the page is public. The export carries no
 * message TEXT — only counts — so it says nothing the page does not.
 */
export const Route = createFileRoute('/api/sohumtracker/export')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          // A heavier response than `activity`, and a download nobody needs to
          // repeat in a loop, so it gets the tighter bucket.
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'sohumtracker-export' },
          cache: { visibility: 'public', maxAge: 60, staleWhileRevalidate: 300 },
          query: z.object({
            format: z.enum(['json', 'csv']).optional(),
            days: z.coerce.number().int().min(1).max(MAX_HISTORY_DAYS).optional(),
          }),
        },
        async ({ query }) => {
          const state = await getWatchState({ days: query?.days ?? DEFAULT_HISTORY_DAYS });
          const csv = query?.format === 'csv';
          const filename = `sohumtracker-${state.todayKey}.${csv ? 'csv' : 'json'}`;
          const body = csv ? toCsv(state) : JSON.stringify(toDossierJson(state), null, 2);

          return new Response(body, {
            headers: {
              'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
              // Quoted: the filename contains no spaces today, but the date is
              // the only thing keeping that true.
              'Content-Disposition': `attachment; filename="${filename}"`,
            },
          });
        },
      ),
    },
  },
});
