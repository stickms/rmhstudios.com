import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
/**
 * Validate a CLI token and return user info.
 * POST /api/rmhcode/auth/validate
 * Called by the CLI to verify authentication.
 */

import { prisma } from '@/lib/prisma.server';
import { hashRmhCodeToken } from '@/lib/rmhcode-auth';
import { z } from 'zod';

const validateTokenSchema = z.object({
  token: z.string().length(64),
});

export const Route = createFileRoute('/api/rmhcode/auth/validate')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 100, windowMs: 60 * 1000, prefix: 'rmhcode-validate' },
        },
        async ({ request }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = validateTokenSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid token format' }, { status: 400 });
          }

          const { token } = parsed.data;

          // Find token by its hash (only hashes are stored).
          const tokenRecord = await prisma.rmhCodeToken.findUnique({
            where: { token: hashRmhCodeToken(token) },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                  image: true,
                },
              },
            },
          });

          if (!tokenRecord) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
          }

          // Check if revoked
          if (tokenRecord.revokedAt) {
            return Response.json({ error: 'Token has been revoked' }, { status: 401 });
          }

          // Check if expired
          if (tokenRecord.expiresAt < new Date()) {
            return Response.json({ error: 'Token has expired' }, { status: 401 });
          }

          // Update last used timestamp
          await prisma.rmhCodeToken.update({
            where: { id: tokenRecord.id },
            data: { lastUsedAt: new Date() },
          });

          return Response.json({
            valid: true,
            user: {
              id: tokenRecord.user.id,
              name: tokenRecord.user.name,
              username: tokenRecord.user.username,
              email: tokenRecord.user.email,
              image: tokenRecord.user.image,
            },
          });
        },
      ),
    },
  },
});
