import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
/**
 * Initiate OAuth flow for CLI authentication.
 * Called when user clicks "Authorize" on the auth page.
 * POST /api/rmhcode/auth/initiate
 */

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma.server';
import { hashRmhCodeToken } from '@/lib/rmhcode-auth';
import { z } from 'zod';

const initiateSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

// Token validity: 30 days
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute('/api/rmhcode/auth/initiate')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 10,
            windowMs: 60 * 60 * 1000,
            prefix: 'rmhcode-oauth',
            message: 'Too many requests. Please try again later.',
          },
        },
        async ({ request, session }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = initiateSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          // Generate token
          const token = randomBytes(32).toString('hex');

          // Store only the token's hash with the CLI session name.
          await prisma.rmhCodeToken.create({
            data: {
              userId: session.user.id,
              token: hashRmhCodeToken(token),
              name: `CLI Login (${new Date().toLocaleDateString()})`,
              expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
            },
          });

          return Response.json({
            token,
            user: {
              id: session.user.id,
              name: session.user.name,
              username: (session.user as { username?: string }).username,
            },
          });
        },
      ),
    },
  },
});
