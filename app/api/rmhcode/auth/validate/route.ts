/**
 * Validate a CLI token and return user info.
 * POST /api/rmhcode/auth/validate
 * Called by the CLI to verify authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

export const runtime = 'nodejs';

const validateTokenSchema = z.object({
  token: z.string().length(64),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 100 validations per minute per IP
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 100,
      windowMs: 60 * 1000,
      prefix: 'rmhcode-validate',
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const parsed = validateTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid token format' }, { status: 400 });
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
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if revoked
    if (tokenRecord.revokedAt) {
      return NextResponse.json({ error: 'Token has been revoked' }, { status: 401 });
    }

    // Check if expired
    if (tokenRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Token has expired' }, { status: 401 });
    }

    // Update last used timestamp
    await prisma.rmhCodeToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
