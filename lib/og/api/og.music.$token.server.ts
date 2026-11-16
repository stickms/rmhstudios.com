import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { renderPageCard } from '@/lib/og/page-card.server';
import { cardLines } from '@/lib/rmhmusic/learn/social/share';
import { getSharedResult } from '@/lib/rmhmusic/learn/social/share.server';

const NOINDEX = { 'X-Robots-Tag': 'noindex' };

/**
 * GET /api/og/music/$token — the card of a shared RMH Music result (Phase 6, plan 1.4).
 *
 * Drawn from the snapshot the server stored when the link was made, never from client text, as
 * the site's Steel page card (`docs/open-graph.md` §1), in English like every card. The name and
 * picture appear only when the link chose to show them, resolved live. Read as a signed-out
 * viewer would: every reason a link cannot be seen (stopped, expired, hidden, a banned author) is
 * a 404. Cached ten minutes, not immutable: stopping a link must take its card down on our side
 * within that (previews other services already fetched keep their copy). Every answer says
 * `X-Robots-Tag: noindex`: the page is noindex, and its card must not land in image search either.
 */
export const route = apiRoute('/api/og/music/$token', {
  GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async ({ params }) => {
    const view = await getSharedResult(params.token ?? '', null, Date.now());
    if (view.state !== 'live') return new Response('Not found', { status: 404, headers: NOINDEX });

    const lines = cardLines(view.payload);
    const byline = view.name ? { name: view.name, image: view.image } : null;
    const png = await renderPageCard({
      cacheKey: `music:${params.token}:${JSON.stringify(view.payload)}:${view.name ?? ''}:${view.image ?? ''}`,
      eyebrow: 'RMH Music',
      lead: lines.lead,
      title: lines.title,
      subtitle: lines.subtitle,
      // The chip reads "2 of 3 stars": the figure, then its label.
      stats: [{ value: `${view.payload.stars} of 3`, label: 'stars', lead: true }],
      byline,
      art: '/images/games/rmhmusic.webp',
      path: '/rmhmusic',
      ttlMs: 10 * 60 * 1000,
    });

    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=600, s-maxage=600',
        ...NOINDEX,
      },
    });
  }),
});
