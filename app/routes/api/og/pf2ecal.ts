import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { renderPageCard } from '@/lib/og/page-card.server';
import { buildBoardCard } from '@/lib/pf2ecal/og.server';

/**
 * GET /api/og/pf2ecal — the unfurl card for the table's calendar.
 *
 * The point of this page being shareable at all is the Discord paste: someone
 * drops the link in the channel and everyone should learn *when the next
 * session is* without opening it. So the card is the answer to that question —
 * the date, the time in both zones, and how many people have replied — not a
 * logo.
 *
 * `auth: 'none'` and a public cache: the card says no more than the `.ics` feed
 * already does, and an OG crawler arrives with no cookies, so a card behind a
 * session check unfurls as nothing. It stays out of search because the page
 * itself is `noindex, nofollow`; this is for the paste, not the index.
 *
 * No id in the path because there is one board. `renderPageCard` does its own
 * content-keyed caching, and `buildBoardCard` derives that key from the next
 * session's id and reply count — so the bytes are only re-rendered when the
 * thing the card is about actually changes.
 */
export const Route = createFileRoute('/api/og/pf2ecal')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async () => {
        const png = await renderPageCard(await buildBoardCard());
        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            // Shorter than the other cards': this one goes stale the moment a
            // session passes or someone replies, and it is cheap to rebuild.
            'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
          },
        });
      }),
    },
  },
});
