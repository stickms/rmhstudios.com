import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { revokeRmhCodeTokenApi } from '@/lib/rmhcode/tokens.contract';
/**
 * Revoke a CLI token.
 * POST /api/rmhcode/auth/revoke
 */

import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

const revokeTokenSchema = z.object({
  tokenId: z.string().min(1),
});

export const route = apiRoute('/api/rmhcode/auth/revoke', {
  POST: implement(
    revokeRmhCodeTokenApi,
    { body: revokeTokenSchema, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ session, body }) => {
      const { tokenId } = body;

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
    },
  ),
});
