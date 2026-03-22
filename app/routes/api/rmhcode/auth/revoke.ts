import { createFileRoute } from '@tanstack/react-router';
/**
 * Revoke a CLI token.
 * POST /api/rmhcode/auth/revoke
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

const revokeTokenSchema = z.object({
  tokenId: z.string().min(1),
});

export const Route = createFileRoute('/api/rmhcode/auth/revoke')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    // Check auth
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const parsed = revokeTokenSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { tokenId } = parsed.data;

    // Find and verify ownership
    const tokenRecord = await prisma.rmhCodeToken.findUnique({
      where: { id: tokenId },
    });

    if (!tokenRecord) {
      return Response.json({ error: 'Token not found' }, { status: 404 });
    }

    if (tokenRecord.userId !== session.user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Revoke the token
    await prisma.rmhCodeToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Token revocation error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
