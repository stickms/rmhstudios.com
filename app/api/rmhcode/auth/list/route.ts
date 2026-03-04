/**
 * List all active tokens for the authenticated user.
 * GET /api/rmhcode/auth/list
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Check auth
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all non-revoked tokens for the user
    const tokens = await prisma.rmhCodeToken.findMany({
      where: {
        userId: session.user.id,
        revokedAt: null,
      },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Token list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
