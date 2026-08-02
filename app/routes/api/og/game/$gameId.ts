import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { games } from '@/lib/games';
import { countPublishedGuides, getRatingAgg } from '@/lib/games/meta.server';
import { renderPageCard } from '@/lib/og/page-card.server';

/**
 * GET /api/og/game/$gameId — the Open Graph card for a game hub.
 *
 * The hub used to unfurl as the game's static key art, which said nothing about
 * the page: not the rating, not how many people had reviewed it, not that the
 * page carries guides at all. The card carries the hub's own figures instead,
 * in the site's design language.
 */
export const Route = createFileRoute('/api/og/game/$gameId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const game = games.find((g) => g.id === params.gameId);
        if (!game) return new Response('Not found', { status: 404 });

        const [agg, guides] = await Promise.all([
          getRatingAgg(game.id),
          countPublishedGuides(game.id),
        ]);

        const png = await renderPageCard({
          // Ratings move; bucketing the count keeps a busy game from re-rendering
          // the same card on every new review.
          cacheKey: `game:${game.id}:${agg.average}:${Math.floor(agg.count / 5)}:${guides}`,
          eyebrow: 'Game hub',
          title: game.title,
          subtitle: game.description,
          lead: game.tags.slice(0, 3).join(' · '),
          path: `/games/${game.id}`,
          stats: [
            // A game nobody has rated yet leads with its status instead of a
            // zero — "0.0 rating" reads as a bad game rather than a new one.
            agg.count > 0
              ? { value: agg.average.toFixed(1), label: 'rating', lead: true }
              : { value: game.status ?? 'Playable', label: 'on RMH', lead: true },
            ...(agg.count > 0
              ? [{ value: String(agg.count), label: agg.count === 1 ? 'review' : 'reviews' }]
              : []),
            ...(guides > 0
              ? [{ value: String(guides), label: guides === 1 ? 'guide' : 'guides' }]
              : []),
          ],
        });

        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        });
      }),
    },
  },
});
