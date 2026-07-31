/**
 * GET /tag/{tag}/rss.xml — public posts carrying a hashtag, as RSS 2.0.
 *
 * Visibility is decided by `tagFeedItems`, not here: a feed has no viewer, so
 * the predicate must be the strict public one and must be shared with the user
 * feed rather than re-derived.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { renderRssFeed } from '@/lib/rss';
import { tagFeedItems } from '@/lib/feed/rss.server';

/** Hashtags are alphanumeric + underscore; reject anything else outright. */
const TAG_PATTERN = /^[a-zA-Z0-9_]{1,64}$/;

export const Route = createFileRoute('/tag/$tag/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const tag = params.tag.replace(/^#/, '');
        if (!TAG_PATTERN.test(tag)) throw notFound();

        const items = await tagFeedItems(tag);

        const xml = renderRssFeed({
          title: `#${tag} — RMH Studios`,
          link: `${SITE_URL}/tag/${tag}`,
          feedUrl: `${SITE_URL}/tag/${tag}/rss.xml`,
          description: `Public posts tagged #${tag} on RMH Studios.`,
          items,
        });

        return new Response(xml, {
          status: 200,
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
          },
        });
      },
    },
  },
});
