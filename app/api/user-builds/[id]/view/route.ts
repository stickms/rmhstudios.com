/**
 * Build View API
 * POST /api/user-builds/[id]/view - Record a view
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ id: string }> };

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + process.env.IP_HASH_SALT || 'rmh-salt').digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get current user session (optional)
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    // Find build
    const build = await prisma.userBuild.findUnique({
      where: { id },
      select: { id: true, visibility: true, userId: true, isCurated: true },
    });

    if (!build) {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check if build is accessible
    if (build.visibility === 'PRIVATE') {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }

    // For curated builds, increment every time without creating a BuildView record
    if (build.isCurated) {
      const updatedBuild = await prisma.userBuild.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      });
      return NextResponse.json({
        success: true,
        viewCount: updatedBuild.viewCount,
      });
    }

    // Don't count views from the owner (for non-curated builds)
    if (userId === build.userId) {
      return NextResponse.json({ success: true, viewCount: -1 });
    }

    // Get IP hash for anonymous users
    const ip = getClientIp(req);
    const ipHash = userId ? null : hashIp(ip);

    // Check for existing view
    let existingView = null;
    if (userId) {
      existingView = await prisma.buildView.findUnique({
        where: { buildId_userId: { buildId: id, userId } },
      });
    } else if (ipHash) {
      existingView = await prisma.buildView.findUnique({
        where: { buildId_ipHash: { buildId: id, ipHash } },
      });
    }

    // Only count new views
    if (!existingView) {
      await prisma.$transaction([
        prisma.buildView.create({
          data: {
            buildId: id,
            userId: userId || null,
            ipHash: userId ? null : ipHash,
          },
        }),
        prisma.userBuild.update({
          where: { id },
          data: { viewCount: { increment: 1 } },
        }),
      ]);
    }

    // Get updated count
    const updatedBuild = await prisma.userBuild.findUnique({
      where: { id },
      select: { viewCount: true },
    });

    return NextResponse.json({
      success: true,
      viewCount: updatedBuild?.viewCount ?? 0,
    });
  } catch (error) {
    console.error('Build view error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
