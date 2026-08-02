import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
/**
 * Generate a new CLI token for the authenticated user.
 * POST /api/rmhcode/auth/generate
 */

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma.server';
import { hashRmhCodeToken } from '@/lib/rmhcode-auth';
import { z } from 'zod';

const generateTokenSchema = z.object({
  name: z.string().max(100).optional(),
});

// Token validity: 30 days
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute('/api/rmhcode/auth/generate')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 10,
            windowMs: 60 * 60 * 1000,
            prefix: 'rmhcode-token-gen',
            message: 'Too many token generation requests. Please try again later.',
          },
          body: generateTokenSchema,
          allowEmptyBody: true,
          verboseValidationErrors: true,
        },
        async ({ session, body }) => {
          const { name } = body;

          // Generate cryptographically secure token
          const token = randomBytes(32).toString('hex'); // 64 chars

          // Store only the token's hash; the plaintext is shown once below.
          const tokenRecord = await prisma.rmhCodeToken.create({
            data: {
              userId: session.user.id,
              token: hashRmhCodeToken(token),
              name: name || null,
              expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
            },
          });

          return Response.json(
            {
              id: tokenRecord.id,
              token, // Only returned once on creation
              name: tokenRecord.name,
              expiresAt: tokenRecord.expiresAt.toISOString(),
            },
            { status: 201 },
          );
        },
      ),
    },
  },
});
