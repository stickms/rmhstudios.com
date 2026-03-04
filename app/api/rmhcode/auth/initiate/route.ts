/**
 * Initiate OAuth flow for CLI authentication.
 * Called when user clicks "Authorize" on the auth page.
 * POST /api/rmhcode/auth/initiate
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

export const runtime = 'nodejs';

const initiateSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

// Token validity: 30 days
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    // Check auth
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 tokens per hour
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
      prefix: 'rmhcode-oauth',
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const parsed = initiateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    // Generate token
    const token = randomBytes(32).toString('hex');

    // Store token with CLI session name
    await prisma.rmhCodeToken.create({
      data: {
        userId: session.user.id,
        token,
        name: `CLI Login (${new Date().toLocaleDateString()})`,
        expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
      },
    });

    return NextResponse.json({
      token,
      user: {
        id: session.user.id,
        name: session.user.name,
        username: (session.user as { username?: string }).username,
      },
    });
  } catch (error) {
    console.error('OAuth initiate error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
