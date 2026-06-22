import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

/**
 * /sitemap.xml — dynamic sitemap for crawlers.
 *
 * Combines static top-level routes (home, games, apps, legal) with DB-backed
 * public content (blog posts, published news, public user builds). Cached for
 * an hour at the edge.
 */

const SITE_URL = 'https://rmhstudios.com';

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!)
  );
}

function renderSitemap(urls: UrlEntry[]): string {
  const body = urls
    .map((u) => {
      const parts = [`    <loc>${xmlEscape(SITE_URL + u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const urls: UrlEntry[] = [
          { loc: '/', changefreq: 'daily', priority: 1.0 },
          { loc: '/games', changefreq: 'weekly', priority: 0.9 },
          { loc: '/apps', changefreq: 'weekly', priority: 0.9 },
          { loc: '/news', changefreq: 'daily', priority: 0.8 },
          { loc: '/blog', changefreq: 'weekly', priority: 0.8 },
          { loc: '/research', changefreq: 'weekly', priority: 0.6 },
          { loc: '/deeplink', changefreq: 'weekly', priority: 0.7 },
          { loc: '/user-builds', changefreq: 'daily', priority: 0.7 },
          { loc: '/pricing', changefreq: 'monthly', priority: 0.5 },
          { loc: '/privacy', changefreq: 'yearly', priority: 0.2 },
          { loc: '/terms', changefreq: 'yearly', priority: 0.2 },
          { loc: '/cookies', changefreq: 'yearly', priority: 0.2 },
          { loc: '/copyright', changefreq: 'yearly', priority: 0.2 },
        ];

        // Static in-app routes for each first-party game and app.
        for (const g of games) {
          if (g.href.startsWith('/')) urls.push({ loc: g.href, changefreq: 'weekly', priority: 0.7 });
        }
        for (const a of apps) {
          if (a.href.startsWith('/')) urls.push({ loc: a.href, changefreq: 'weekly', priority: 0.7 });
        }

        // DB-backed public content. Failures here shouldn't 500 the sitemap.
        try {
          const [posts, news, builds] = await Promise.all([
            prisma.blogPost.findMany({ select: { slug: true, updatedAt: true }, take: 1000 }),
            prisma.newsArticle.findMany({
              where: { status: 'PUBLISHED' },
              select: { slug: true, updatedAt: true },
              take: 2000,
            }),
            prisma.userBuild.findMany({
              where: { visibility: 'PUBLIC' },
              select: { slug: true, updatedAt: true },
              take: 5000,
            }),
          ]);

          for (const p of posts) {
            urls.push({ loc: `/blog/${p.slug}`, lastmod: p.updatedAt.toISOString(), changefreq: 'monthly', priority: 0.6 });
          }
          for (const n of news) {
            urls.push({ loc: `/news/${n.slug}`, lastmod: n.updatedAt.toISOString(), changefreq: 'monthly', priority: 0.5 });
          }
          for (const b of builds) {
            urls.push({ loc: `/user-builds/${b.slug}`, lastmod: b.updatedAt.toISOString(), changefreq: 'weekly', priority: 0.5 });
          }
        } catch (e) {
          console.error('[sitemap] DB query failed, serving static routes only:', e);
        }

        return new Response(renderSitemap(urls), {
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
