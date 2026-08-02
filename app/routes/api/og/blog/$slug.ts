import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { renderPageCard } from '@/lib/og/page-card.server';

/** Roughly how many words a minute the devlog's readers get through. */
const WPM = 220;

/**
 * GET /api/og/blog/$slug — the Open Graph card for a devlog post.
 *
 * Only used when the post has no hero image of its own: an author who picked a
 * picture for the post picked it for the unfurl too. Everything else — most of
 * the archive — previewed as the site-wide default image, which named neither
 * the post nor even the blog.
 */
export const Route = createFileRoute('/api/og/blog/$slug')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const post = await prisma.blogPost.findUnique({
          where: { slug: params.slug },
          select: {
            slug: true,
            title: true,
            description: true,
            date: true,
            tags: true,
            content: true,
            updatedAt: true,
          },
        });
        if (!post) return new Response('Not found', { status: 404 });

        const words = post.content.split(/\s+/).filter(Boolean).length;
        const minutes = Math.max(1, Math.round(words / WPM));

        const png = await renderPageCard({
          cacheKey: `blog:${post.slug}:${post.updatedAt.getTime()}`,
          eyebrow: 'Devlog',
          title: post.title,
          subtitle: post.description,
          lead: post.tags.slice(0, 3).join(' · '),
          path: `/blog/${post.slug}`,
          stats: [
            { value: `${minutes} min`, label: 'read', lead: true },
            ...(post.date ? [{ value: post.date, label: 'published' }] : []),
          ],
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
