import { createFileRoute, notFound } from '@tanstack/react-router';
import { parseChunkName } from '@/lib/sitemap';
import { respondSitemap } from '@/lib/sitemap-serve.server';

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
      GET: async ({ params, request }) => {
        const parsed = parseChunkName(params.name);
        if (!parsed) throw notFound();

        const response = await respondSitemap(request, parsed.section, parsed.chunk);
        if (!response) throw notFound();
        return response;
      },
    },
  },
});
