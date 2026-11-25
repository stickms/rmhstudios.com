import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getCardData } from '@features/medschools/api/read.server';
import { renderMedSchoolCard } from '@/lib/og/med-card.server';

/**
 * GET /api/og/med-school/$slug: the Open Graph card for a school's RMH Med Schools page, in the app's own design
 * (`lib/og/med-card.server.tsx`).
 *
 * Draws only what the public page itself shows (`getCardData`): the name, degree and place, the newest entering
 * class's MCAT and GPA as the Facts tab prints them, the one interview figure left after the k floor (a suppressed or
 * program-less count never reaches it), and the newest public event the index row shows. Absent facts are left out.
 * An unknown or inactive slug is a 404, as on the page. The renderer keys its cache on everything it draws.
 */
export const route = apiRoute('/api/og/med-school/$slug', {
  GET: defineHandler({ auth: 'none' }, async ({ params }) => {
    const card = await getCardData(params.slug);
    if (!card) return new Response('Not found', { status: 404 });

    const png = await renderMedSchoolCard(card);

    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  }),
});
