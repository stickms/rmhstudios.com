import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createCommentSchema } from "@/lib/rmhark-schema";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { getActiveBan } from "@/lib/admin-audit.server";
import { createComment } from "@/lib/social/engagement.server";

export const Route = createFileRoute('/api/rmharks/$id/comment')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id } = params;

    // Get current user for liked/reposted status
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const commentInclude = {
      user: { select: userDisplaySelect },
      _count: { select: { likes: true, reposts: true, views: true } },
      ...(userId
        ? {
            likes: { where: { userId }, select: { id: true } },
            reposts: { where: { userId }, select: { id: true } },
          }
        : {}),
    } as const;

    // Fetch every comment for this post (flat), then build the full reply
    // tree in memory. Prisma can only nest a fixed number of `replies`
    // levels, so deep chains (reply-to-a-reply-to-a-reply…) must be
    // assembled here or they'd never reach the client.
    const comments = await prisma.rMHarkComment.findMany({
      where: { rmheetId: id },
      orderBy: { createdAt: "asc" },
      include: commentInclude,
    });

    const resolveComment = (c: typeof comments[number]) => {
      const isDeleted = !!c.deletedAt;
      const deletedMessage = c.deletedByAdmin 
        ? "[This reply was deleted by an admin]" 
        : "[This reply was deleted by the user]";
        
      return {
        id: c.id,
        content: isDeleted ? deletedMessage : c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        rmheetId: c.rmheetId,
        parentId: c.parentId,
        userId: c.userId,
        user: resolveUser(c.user),
        likeCount: c._count.likes,
        repostCount: c._count.reposts,
        viewCount: c._count.views,
        liked: userId ? ("likes" in c ? (c.likes as { id: string }[]).length > 0 : false) : false,
        reposted: userId ? ("reposts" in c ? (c.reposts as { id: string }[]).length > 0 : false) : false,
        deletedAt: c.deletedAt?.toISOString() || null,
        deletedByAdmin: c.deletedByAdmin,
      };
    };

    // Build the nested tree. Comments were fetched oldest-first, so each
    // parent's `replies` ends up in ascending chronological order.
    type ResolvedComment = ReturnType<typeof resolveComment> & { replies: ResolvedComment[] };
    const byId = new Map<string, ResolvedComment>();
    for (const c of comments) {
      byId.set(c.id, { ...resolveComment(c), replies: [] });
    }

    const roots: ResolvedComment[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : null;
      if (parent) {
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    }

    // Top-level comments are shown newest-first.
    roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Response.json(roots);
  } catch (error) {
    console.error("Fetch comments error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
  POST: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ban = await getActiveBan(session.user.id);
    if (ban) {
      return Response.json(
        { error: `Your account is suspended${ban.reason ? `: ${ban.reason}` : ''}` },
        { status: 403 }
      );
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "rmhark-comment",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id } = params;
    const body = await request.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    // Delegate to the shared engagement service (counters, SSE, notifications,
    // mention fan-out, XP, quests, achievements, and webhooks all live there).
    const result = await createComment({
      userId: session.user.id,
      postId: id,
      content: parsed.data.content,
      parentId: parsed.data.parentId ?? null,
    });
    if (!result.found || !result.comment) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }
    const comment = result.comment;

    return Response.json({
      ...comment,
      user: resolveUser(comment.user),
      likeCount: 0,
      repostCount: 0,
      viewCount: 0,
      liked: false,
      reposted: false,
      replies: [],
      deletedAt: null,
      deletedByAdmin: false,
    }, { status: 201 });
  } catch (error) {
    console.error("Post comment error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
