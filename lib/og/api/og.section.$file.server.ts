import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { STATIC_CARDS } from '@/lib/og/static-cards';
import { liveStatsFor } from '@/lib/og/live-stats.server';
import { renderPageCard } from '@/lib/og/page-card.server';
import { renderMedSectionCard } from '@/lib/og/med-card.server';
import { apps } from '@/lib/catalog';
import { shuffle } from '@/lib/core/rng';

/** The section cards drawn in the RMH Med Schools design (`lib/og/med-card.server.tsx`). */
const MED_SECTION_KIND: Record<string, 'index' | 'live'> = { med: 'index', 'med-live': 'live' };

/** How many of the catalog's cards a gallery card draws (the 2×2 the post card uses for four photos). */
const GALLERY_SIZE = 4;

/** Four apps with art, in a new order on every render: the card shows what is there, not the same four forever. */
function pickGallery(kind: 'apps'): string[] {
  const pool = kind === 'apps' ? apps.filter((a) => a.imagePath && !a.hidden && !a.unlisted) : [];
  return shuffle(pool.map((a) => a.imagePath as string)).slice(0, GALLERY_SIZE);
}

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
export const route = apiRoute('/api/og/section/$file', {
  GET: defineHandler({ auth: 'none' }, async ({ params }) => {
    const card = STATIC_CARDS.find((c) => c.file === params.file);
    if (!card || card.file === 'default') return new Response('Not found', { status: 404 });

    try {
      // RMH Med Schools keeps its own look on its cards (L8): the same copy, drawn by the app's renderer.
      const med = MED_SECTION_KIND[card.file];
      if (med) {
        const png = await renderMedSectionCard({ kind: med, title: card.title, subtitle: card.subtitle });
        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        });
      }
      const stats = await liveStatsFor(card);
      const gallery = card.gallery ? pickGallery(card.gallery) : undefined;
      const png = await renderPageCard({
        // Everything drawn is in the key: the copy is fixed per file, the figures are not (the gallery's picks are
        // keyed by the renderer itself).
        cacheKey: `section:${card.file}:${(stats ?? []).map((s) => `${s.value}${s.label}`).join(',')}`,
        eyebrow: card.eyebrow,
        title: card.title,
        subtitle: card.subtitle,
        stats,
        art: card.art ?? null,
        ...(gallery ? { gallery } : {}),
        path: card.path,
      });
      return new Response(new Uint8Array(png), {
        headers: {
          'Content-Type': 'image/png',
          // A gallery is drawn fresh on each render, so the CDN keeps it ten minutes rather than a day.
          'Cache-Control': gallery
            ? 'public, max-age=600, s-maxage=600'
            : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        },
      });
    } catch {
      return new Response(null, {
        status: 302,
        headers: { Location: '/images/og/default.png', 'Cache-Control': 'public, max-age=300' },
      });
    }
  }),
});
