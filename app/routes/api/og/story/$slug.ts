import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getStoryPage } from '@/lib/reading/stories.server';
import { renderPageCard } from '@/lib/og/page-card.server';

/**
 * GET /api/og/story/$slug — the Open Graph card for a news story timeline.
 *
 * A story is a set of related articles shown as one dated timeline, so the card says how many there are and how far
 * back it goes — the part of the page that is not in its title. Only published articles are counted, the same set the
 * page lists.
 */
export const Route = createFileRoute('/api/og/story/$slug')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const story = await getStoryPage(params.slug);
        if (!story) return new Response('Not found', { status: 404 });

        const first = story.articles[0]?.date ?? null;
        const last = story.articles[story.articles.length - 1]?.date ?? null;

        const png = await renderPageCard({
          cacheKey: `story:${story.slug}:${story.articles.length}:${last ?? ''}`,
          eyebrow: 'News story',
          title: story.title,
          subtitle: story.summary,
          path: `/news/stories/${story.slug}`,
          // A story with nothing published yet has no figures to show, and "0 articles" reads as a dead page.
          stats:
            story.articles.length > 0
              ? [
                  {
                    value: String(story.articles.length),
                    label: story.articles.length === 1 ? 'article' : 'articles',
                    lead: true,
                  },
                  ...(first ? [{ value: first, label: 'first' }] : []),
                  ...(last && last !== first ? [{ value: last, label: 'latest' }] : []),
                ]
              : [],
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
