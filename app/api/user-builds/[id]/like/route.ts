/**
 * Build Like API
 * POST /api/user-builds/[id]/like - Toggle like
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check auth
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 100 likes per minute
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 100,
      windowMs: 60 * 1000,
      prefix: 'build-like',
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Find build
    const build = await prisma.userBuild.findUnique({
      where: { id },
      select: { id: true, visibility: true },
    });

    if (!build) {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check if build is accessible
    if (build.visibility === 'PRIVATE') {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check existing like
    const existingLike = await prisma.buildLike.findUnique({
      where: { buildId_userId: { buildId: id, userId: session.user.id } },
    });

    let liked: boolean;

    if (existingLike) {
      // Unlike
      await prisma.$transaction([
        prisma.buildLike.delete({ where: { id: existingLike.id } }),
        prisma.userBuild.update({
          where: { id },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      liked = false;
    } else {
      // Like
      await prisma.$transaction([
        prisma.buildLike.create({
          data: { buildId: id, userId: session.user.id },
        }),
        prisma.userBuild.update({
          where: { id },
          data: { likeCount: { increment: 1 } },
        }),
      ]);
      liked = true;
    }

    // Get updated count
    const updatedBuild = await prisma.userBuild.findUnique({
      where: { id },
      select: { likeCount: true },
    });

    return NextResponse.json({
      liked,
      likeCount: updatedBuild?.likeCount ?? 0,
    });
  } catch (error) {
    console.error('Build like error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
