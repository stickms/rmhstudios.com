import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { STATIC_CARDS } from '@/lib/og/static-cards';
import { liveStatsFor } from '@/lib/og/live-stats.server';
import { renderPageCard } from '@/lib/og/page-card.server';

/**
 * GET /api/og/section/$file — the Open Graph card for a section of the site.
 *
 * Every page that used to unfurl as the home card ("Make it, play it, share it.") now has a card that says what
 * it is. The copy is data (`lib/og/static-cards.ts`); the figures are read when the card is rendered
 * (`lib/og/live-stats.server.ts`), so "25 games" is the catalog's number and not whatever it was when a PNG was
 * last committed.
 *
 * The entry is looked up by `file`, never rendered from the request: nothing in the URL becomes text on the card,
 * so this route cannot be used to put words on rmhstudios.com's own image host.
 *
 * Rendering needs the card font, which is fetched once per process. If anything about the render fails, the answer
 * is a redirect to the site-wide card rather than an error — an unfurl with the generic image is a worse card, an
 * unfurl with no image is a broken one.
 */
export const Route = createFileRoute('/api/og/section/$file')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const card = STATIC_CARDS.find((c) => c.file === params.file);
        if (!card || card.file === 'default') return new Response('Not found', { status: 404 });

        try {
          const stats = await liveStatsFor(card);
          const png = await renderPageCard({
            // Everything drawn is in the key: the copy is fixed per file, the figures are not.
            cacheKey: `section:${card.file}:${(stats ?? []).map((s) => `${s.value}${s.label}`).join(',')}`,
            eyebrow: card.eyebrow,
            title: card.title,
            subtitle: card.subtitle,
            stats,
            art: card.art ?? null,
            path: card.path,
          });
          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
            },
          });
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: '/images/og/default.png', 'Cache-Control': 'public, max-age=300' },
          });
        }
      }),
    },
  },
});
