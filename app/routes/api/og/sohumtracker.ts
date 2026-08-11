import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { renderPageCard } from '@/lib/og/page-card.server';
import { buildDayCard, buildOverviewCard } from '@/lib/sohumtracker/og.server';

/**
 * GET /api/og/sohumtracker — the unfurl card for the dossier and for one day of it.
 *
 * `?date=YYYY-MM-DD` draws that day's report; without it, the front page's. The
 * day is a QUERY parameter rather than a path segment so this stays one route
 * with one cache policy — the card differs by content, not by kind.
 *
 * `auth: 'none'` and a public cache: the card says no more than the page does,
 * and an OG crawler arrives with no cookies, so a card behind a session check
 * unfurls as nothing. The page stays out of search because it is `noindex`; this
 * is for the paste.
 *
 * An unknown or future date falls back to the overview card rather than 404ing —
 * a broken image in a chat is worse than a generic one, and the link beside it
 * still goes somewhere real.
 */
export const Route = createFileRoute('/api/og/sohumtracker')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          query: z.object({ date: z.string().max(10).optional() }),
        },
        async ({ query }) => {
          const card = query?.date
            ? ((await buildDayCard(query.date)) ?? (await buildOverviewCard()))
            : await buildOverviewCard();
          const png = await renderPageCard(card);
          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              // Short: a day card goes stale the moment he says anything else,
              // and `renderPageCard` already de-duplicates identical content by
              // its cache key, so a re-request is usually free anyway.
              'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
            },
          });
        },
      ),
    },
  },
});
