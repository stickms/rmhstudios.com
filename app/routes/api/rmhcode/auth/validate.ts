import { createFileRoute } from '@tanstack/react-router';
/**
 * Validate a CLI token and return user info.
 * POST /api/rmhcode/auth/validate
 * Called by the CLI to verify authentication.
 */

import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

const validateTokenSchema = z.object({
  token: z.string().length(64),
});

export const Route = createFileRoute('/api/rmhcode/auth/validate')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    // Rate limit: 100 validations per minute per IP
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 100,
      windowMs: 60 * 1000,
      prefix: 'rmhcode-validate',
    });
    if (!allowed) {
      return Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const parsed = validateTokenSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid token format' }, { status: 400 });
    }

    const { token } = parsed.data;

    // Find token
    const tokenRecord = await prisma.rmhCodeToken.findUnique({
      where: { token },
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
  } catch (error) {
    console.error('Token validation error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
