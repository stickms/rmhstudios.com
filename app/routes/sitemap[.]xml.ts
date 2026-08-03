import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { renderSitemapIndex } from '@/lib/sitemap';
import { listSitemapChunks } from '@/lib/sitemap.server';

/**
 * /sitemap.xml — the sitemap *index*.
 *
 * This used to be a single `<urlset>`. It was already close to the protocol's
 * 50,000-URL ceiling before user profiles, posts, vibe pages and communities
 * were added to it, and a sitemap over that limit is rejected in full rather
 * than truncated — so the file that was meant to make everything discoverable
 * would have made nothing discoverable. The index points at
 * `/sitemaps/{section}[-{n}].xml` instead, each of which stays comfortably
 * under the limit and can be re-crawled independently.
 */

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const chunks = await listSitemapChunks();
        // `listSitemapChunks` already swallows per-section failures, so an empty
        // result means every section failed — serve the static page sitemap
        // alone rather than an empty index a crawler would treat as "nothing
        // here any more".
        const paths = chunks.length > 0 ? chunks : ['/sitemaps/pages.xml'];

        return new Response(renderSitemapIndex(paths, SITE_URL, new Date()), {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          },
        });
      },
    },
  },
});
