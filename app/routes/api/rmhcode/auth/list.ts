import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { listRmhCodeTokensApi } from '@/lib/rmhcode/tokens.contract';
/**
 * List all active tokens for the authenticated user.
 * GET /api/rmhcode/auth/list
 */

import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/rmhcode/auth/list')({
  server: {
    handlers: {
      GET: implement(listRmhCodeTokensApi, {}, async ({ session }) => {
        const tokens = await prisma.rmhCodeToken.findMany({
          where: {
            userId: session.user.id,
            revokedAt: null,
          },
          select: {
            id: true,
            name: true,
            lastUsedAt: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return Response.json({
          tokens: tokens.map((t) => ({
            id: t.id,
            name: t.name,
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            createdAt: t.createdAt.toISOString(),
            expiresAt: t.expiresAt.toISOString(),
          })),
        });
      }),
    },
  },
});
