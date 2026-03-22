import { createFileRoute } from '@tanstack/react-router';
/**
 * List all active tokens for the authenticated user.
 * GET /api/rmhcode/auth/list
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/rmhcode/auth/list')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    // Check auth
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all non-revoked tokens for the user
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
  } catch (error) {
    console.error('Token list error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
