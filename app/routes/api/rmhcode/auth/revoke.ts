import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
/**
 * Revoke a CLI token.
 * POST /api/rmhcode/auth/revoke
 */

import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

const revokeTokenSchema = z.object({
  tokenId: z.string().min(1),
});

export const Route = createFileRoute('/api/rmhcode/auth/revoke')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, session }) => {
        const body = await request.json().catch(() => ({}));
        const parsed = revokeTokenSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
            { status: 400 },
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
      }),
    },
  },
});
