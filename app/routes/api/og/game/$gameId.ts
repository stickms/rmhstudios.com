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
 * page carries guides at all. Replacing it with a figures-only card then lost
 * the other half — the art is how the catalog, the arcade and the home page all
 * identify a game, so a link that showed only its title was the one surface
 * where it looked like nothing in particular. The card carries both: the hub's
 * figures in the site's design language, beside the game's own key art.
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
          // Two tags, not three: the kicker shares its line with nothing, and
          // the pane is half as wide once the art is in it.
          lead: game.tags.slice(0, 2).join(' · '),
          art: game.imagePath ?? null,
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
