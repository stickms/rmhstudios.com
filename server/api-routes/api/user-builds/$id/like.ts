import { createAPIFileRoute } from "@tanstack/react-start/api";
/**
 * Build Like API
 * POST /api/user-builds/[id]/like - Toggle like
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

type RouteParams = { params: Promise<{ id: string }> };

export const APIRoute = createAPIFileRoute("/api/user-builds/$id/like")({
  POST: async ({ request, params }) => {
  try {
    const { id } = params;

    // Check auth
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 100 likes per minute
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 100,
      windowMs: 60 * 1000,
      prefix: 'build-like',
    });
    if (!allowed) {
      return Response.json(
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
      return Response.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check if build is accessible
    if (build.visibility === 'PRIVATE') {
      return Response.json({ error: 'Build not found' }, { status: 404 });
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

    return Response.json({
      liked,
      likeCount: updatedBuild?.likeCount ?? 0,
    });
  } catch (error) {
    console.error('Build like error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
});
