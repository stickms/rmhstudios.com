import { createFileRoute } from '@tanstack/react-router';
/**
 * Build Comments API
 * GET /api/user-builds/[id]/comments - List comments
 * POST /api/user-builds/[id]/comments - Add comment
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createCommentSchema } from '@/lib/user-builds-schema';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

type RouteParams = { params: Promise<{ id: string }> };

export const Route = createFileRoute('/api/user-builds/$id/comments')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    // Find build
    const build = await prisma.userBuild.findUnique({
      where: { id },
      select: { id: true, visibility: true },
    });

    if (!build) {
      return Response.json({ error: 'Build not found' }, { status: 404 });
    }

    // Build query
    const where: Record<string, unknown> = {
      buildId: id,
      parentId: null, // Top-level comments only
    };

    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    // Fetch comments with replies
    const comments = await prisma.buildComment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: userDisplaySelect },
        replies: {
          orderBy: { createdAt: 'asc' },
          take: 5,
          include: {
            user: { select: userDisplaySelect },
          },
        },
        _count: { select: { replies: true } },
      },
    });

    const hasMore = comments.length > limit;
    const items = comments.slice(0, limit);

    const mappedItems = items.map((comment: any) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      user: resolveUser(comment.user),
      replyCount: comment._count.replies,
      replies: comment.replies.map((reply: any) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
        user: resolveUser(reply.user),
      })),
    }));

    return Response.json({
      items: mappedItems,
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      hasMore,
    });
  } catch (error) {
    console.error('Comments fetch error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
  POST: async ({ request, params }) => {
  try {
    const { id } = params;

    // Check auth
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 30 comments per minute
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 30,
      windowMs: 60 * 1000,
      prefix: 'build-comment',
    });
    if (!allowed) {
      return Response.json(
        { error: 'Too many comments. Please slow down.' },
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

    // Parse and validate
    const body = await request.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { content, parentId } = parsed.data;

    // If replying, verify parent exists
    if (parentId) {
      const parent = await prisma.buildComment.findUnique({
        where: { id: parentId },
        select: { buildId: true },
      });
      if (!parent || parent.buildId !== id) {
        return Response.json({ error: 'Parent comment not found' }, { status: 404 });
      }
    }

    // Create comment and update count
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.buildComment.create({
        data: {
          buildId: id,
          userId: session.user.id,
          content: content.trim(),
          parentId: parentId || null,
        },
        include: {
          user: { select: userDisplaySelect },
        },
      });

      await tx.userBuild.update({
        where: { id },
        data: { commentCount: { increment: 1 } },
      });

      return created;
    });

    return Response.json(
      {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        user: resolveUser(comment.user),
        parentId: comment.parentId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Comment create error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
