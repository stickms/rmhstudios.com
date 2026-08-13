import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { apps } from '@/lib/apps';
import { renderPageCard } from '@/lib/og/page-card.server';

/**
 * GET /api/og/app/$appId — the Open Graph card for a first-party app.
 *
 * The twelve apps were the last catalog entries with no card of their own.
 * `appRouteHead` pointed `og:image` straight at `app.imagePath` — a raw
 * screenshot at whatever size it happened to be, with no dimensions declared
 * (so consumers reflowed the embed when it landed), no wordmark, no statement
 * of what the page even was, and nothing at all for the several apps that have
 * no `imagePath`, which fell through to the shared `/apps` section card and
 * unfurled identically to each other.
 *
 * Unlike the game card this one touches no database: everything it draws is
 * catalog data, which is why it caches for a day rather than an hour.
 */
export const Route = createFileRoute('/api/og/app/$appId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const app = apps.find((a) => a.id === params.appId);
        if (!app) return new Response('Not found', { status: 404 });

        const png = await renderPageCard({
          cacheKey: `app:${app.id}`,
          eyebrow: 'App',
          title: app.title,
          subtitle: app.description,
          // Two tags, as on the game card — the kicker is a one-line label, and
          // the art takes the width a third would have needed.
          lead: app.tags.slice(0, 2).join(' · '),
          art: app.imagePath ?? null,
          path: app.href.startsWith('/') ? app.href : null,
          // An app has no rating to lead with, so the chip states what it is:
          // the catalog's own badge, or that it is simply live.
          stats: [{ value: app.status ?? 'Live', label: 'on RMH', lead: true }],
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
