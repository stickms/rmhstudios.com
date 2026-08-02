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
      GET: defineHandler({ auth: 'none' }, async () => {
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
      }),
    },
  },
});
