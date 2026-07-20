import { createFileRoute } from '@tanstack/react-router';
import { getMoment } from '@/lib/moments.server';
import { renderStatCard, type StatCardVariant } from '@/lib/og/stat-card.server';

/**
 * GET /api/og/moment/$id — the stat card for a shared moment as a PNG.
 *
 * `?variant=story` renders the 1080×1920 story card; otherwise the 1200×630 OG
 * card. Content is an immutable snapshot (taken at share time), so the response
 * is cached forever. 404s for missing/deleted moments — nothing is public by
 * default and deleting a moment kills its card.
 */
export const Route = createFileRoute('/api/og/moment/$id')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const moment = await getMoment(params.id);
          if (!moment) return new Response('Not found', { status: 404 });

          const variant: StatCardVariant =
            new URL(request.url).searchParams.get('variant') === 'story' ? 'story' : 'landscape';

          const png = await renderStatCard({
            kind: moment.kind,
            title: moment.payload.title,
            value: moment.payload.value,
            subtitle: moment.payload.subtitle,
            user: moment.user,
            variant,
          });

          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              // Immutable: card content never changes for a given moment id.
              'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
            },
          });
        } catch (error) {
          console.error('Moment OG image error:', error);
          return new Response('Failed to render image', { status: 500 });
        }
      },
    },
  },
});
