import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { cycleLabel } from '@features/medschools/engine/cycle';
import { getCardData } from '@features/medschools/api/read.server';
import { renderPageCard } from '@/lib/og/page-card.server';

/**
 * GET /api/og/med-school/$slug: the Open Graph card for a school's RMH Med Schools page.
 *
 * Draws only what the public page itself shows: the name, degree and place, and the one interview figure
 * `getCardData` returns after the k floor (a suppressed or program-less count never reaches it). An unknown or
 * inactive slug is a 404, as on the page.
 */
export const route = apiRoute('/api/og/med-school/$slug', {
  GET: defineHandler({ auth: 'none' }, async ({ params }) => {
    const card = await getCardData(params.slug);
    if (!card) return new Response('Not found', { status: 404 });

    const png = await renderPageCard({
      cacheKey: `med-school:${params.slug}:${card.cycleYear}:${card.reported?.count ?? 'none'}`,
      eyebrow: 'RMH Med Schools',
      title: card.name,
      subtitle: `${card.degree} · ${card.city}, ${card.state}`,
      path: `/med/${params.slug}`,
      ...(card.reported
        ? {
            stats: [
              {
                value: String(card.reported.count),
                label: `reported interview events, ${cycleLabel(card.cycleYear)} cycle`,
                lead: true,
              },
            ],
          }
        : {}),
    });

    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  }),
});
