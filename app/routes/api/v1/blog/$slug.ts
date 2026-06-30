import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';

/** GET /api/v1/blog/{slug} — a single blog post, including markdown content. */
export const Route = createFileRoute('/api/v1/blog/$slug')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const post = await prisma.blogPost.findUnique({
              where: { slug: params.slug },
              select: { slug: true, title: true, description: true, date: true, tags: true, image: true, content: true, createdAt: true, updatedAt: true },
            });
            if (!post) return error('not_found', 'Blog post not found.', 404);
            return json(post);
          },
          { scope: 'read:content' }
        ),
    },
  },
});
