/**
 * Revoke a CLI token.
 * POST /api/rmhcode/auth/revoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';

const revokeTokenSchema = z.object({
  tokenId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    // Check auth
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const parsed = revokeTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { tokenId } = parsed.data;

    // Find and verify ownership
    const tokenRecord = await prisma.rmhCodeToken.findUnique({
      where: { id: tokenId },
    });

    if (!tokenRecord) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    if (tokenRecord.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Revoke the token
    await prisma.rmhCodeToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Token revocation error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
