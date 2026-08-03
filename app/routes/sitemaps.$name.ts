import { createFileRoute, notFound } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { parseChunkName, renderUrlset, type SitemapEntry } from '@/lib/sitemap';
import { renderSection } from '@/lib/sitemap.server';

/**
 * /sitemaps/{section}[-{n}].xml — one child sitemap listed by `/sitemap.xml`.
 *
 * The whole segment is the param (`users-2.xml`) rather than a param plus a
 * literal `.xml` suffix, so the filename stays a plain `$name` and the parsing
 * lives in one tested function.
 */

export const Route = createFileRoute('/sitemaps/$name')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = parseChunkName(params.name);
        if (!parsed) throw notFound();

        let entries: SitemapEntry[] | null;
        try {
          entries = await renderSection(parsed.section, parsed.chunk);
        } catch (e) {
          // A section that can't reach the DB should not 500: a crawler treats
          // repeated 5xx on a sitemap as a reason to slow down fetching the
          // whole site. Serve an empty urlset and keep the index valid.
          console.error(`[sitemap] section "${parsed.section}" failed to render:`, e);
          entries = [];
        }
        if (entries === null) throw notFound();

        return new Response(renderUrlset(entries, SITE_URL), {
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
