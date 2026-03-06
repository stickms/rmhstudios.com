import { createFileRoute } from '@tanstack/react-router';
/**
 * Generate a new CLI token for the authenticated user.
 * POST /api/rmhcode/auth/generate
 */

import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

const generateTokenSchema = z.object({
  name: z.string().max(100).optional(),
});

// Token validity: 30 days
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute('/api/rmhcode/auth/generate')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    // Check auth
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 tokens per hour
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
      prefix: 'rmhcode-token-gen',
    });
    if (!allowed) {
      return Response.json(
        { error: 'Too many token generation requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const parsed = generateTokenSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    // Generate cryptographically secure token
    const token = randomBytes(32).toString('hex'); // 64 chars

    // Store token
    const tokenRecord = await prisma.rmhCodeToken.create({
      data: {
        userId: session.user.id,
        token,
        name: name || null,
        expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
      },
    });

    return Response.json({
      id: tokenRecord.id,
      token, // Only returned once on creation
      name: tokenRecord.name,
      expiresAt: tokenRecord.expiresAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Token generation error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
