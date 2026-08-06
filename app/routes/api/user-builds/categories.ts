import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
/**
 * Build Categories API
 * GET /api/user-builds/categories - List all categories
 */

import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/user-builds/categories')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          // Anonymous-invariant: one global catalog row set, and the only
          // per-row number is a count of PUBLIC builds — nothing here depends on
          // who is asking. Categories change on the order of never, so this is
          // the cheapest possible thing to hand to the edge.
          cache: {
            visibility: 'public',
            maxAge: 60,
            sMaxAge: 300,
            staleWhileRevalidate: 3600,
          },
        },
        async () => {
          const categories = await prisma.buildCategory.findMany({
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              iconName: true,
              color: true,
              _count: { select: { builds: { where: { visibility: 'PUBLIC' } } } },
            },
          });

          return Response.json({
            categories: categories.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              description: c.description,
              iconName: c.iconName,
              color: c.color,
              buildCount: c._count.builds,
            })),
          });
        },
      ),
    },
  },
});
