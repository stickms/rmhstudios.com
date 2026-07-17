import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createCommentSchema } from "@/lib/rmhark-schema";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { getActiveBan } from "@/lib/admin-audit.server";
import { createComment } from "@/lib/social/engagement.server";
import { groupReactions } from "@/lib/social/reactions";
import { canReplyToPost, type ReplyControl } from "@/lib/feed/reply-control.server";
import { decodeCursor, encodeCursor, keysetWhere, type FeedCursor } from "@/lib/feed/cursor";

/** Top-level comments returned per page (keyset-paginated, newest-first). */
const TOP_LEVEL_PAGE = 20;
/** Direct replies eagerly hydrated per parent; the rest load via `?parentId=`. */
const REPLY_CAP_PER_PARENT = 3;
/** Max reply-tree depth walked in one request (deeper via `?parentId=`). */
const MAX_TREE_DEPTH = 6;
/** Hard ceiling on parents expanded per request — bounds total reply queries. */
const MAX_EXPANDED_PARENTS = 80;
/** Page size for the lazy per-parent reply feed (`?parentId=&cursor=`). */
const REPLY_PAGE = 20;

/** Prisma `where` fragment for an ascending `(createdAt, id)` keyset — the order
 *  replies are shown in (oldest-first), used by the `?parentId=` reply feed. */
function ascKeysetWhere(cursor: FeedCursor | null): Record<string, unknown> {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

export const Route = createFileRoute('/api/rmharks/$id/comment')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id } = params;
    const url = new URL(request.url);
    const cursorParam = url.searchParams.get("cursor");
    const parentIdParam = url.searchParams.get("parentId");

    // Get current user for liked/reposted status
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    // Per-comment counts: `likeCount`/`replyCount` come from the denormalized
    // columns (maintained by the like/reply routes) so they never aggregate.
    // reposts/views have no denormalized column yet, but the query is now bounded
    // to one page of comments (+ capped replies), so their `_count` is bounded
    // too — the old handler ran these aggregates over EVERY comment on the post.
    const commentInclude = {
      user: { select: userDisplaySelect },
      _count: { select: { reposts: true, views: true } },
      reactions: { select: { emoji: true, userId: true } },
      ...(userId
        ? {
            likes: { where: { userId }, select: { id: true } },
            reposts: { where: { userId }, select: { id: true } },
          }
        : {}),
    } as const;

    type CommentRow = Awaited<ReturnType<typeof fetchComments>>[number];
    function fetchComments(where: Record<string, unknown>, take: number, desc: boolean) {
      return prisma.rMHarkComment.findMany({
        where: { rmheetId: id, ...where },
        orderBy: [
          { createdAt: desc ? ("desc" as const) : ("asc" as const) },
          { id: desc ? ("desc" as const) : ("asc" as const) },
        ],
        take,
        include: commentInclude,
      });
    }

    const resolveComment = (c: CommentRow) => {
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
        likeCount: c.likeCount,
        repostCount: c._count.reposts,
        viewCount: c._count.views,
        // Denormalized direct-reply count — lets the client tell when a parent
        // has more replies than the (capped) set eagerly returned below.
        replyCount: c.replyCount,
        liked: userId ? ("likes" in c ? (c.likes as { id: string }[]).length > 0 : false) : false,
        reposted: userId ? ("reposts" in c ? (c.reposts as { id: string }[]).length > 0 : false) : false,
        deletedAt: c.deletedAt?.toISOString() || null,
        deletedByAdmin: c.deletedByAdmin,
        reactions: groupReactions(c.reactions, userId),
      };
    };

    type ResolvedComment = ReturnType<typeof resolveComment> & { replies: ResolvedComment[] };

    // ── Lazy per-parent reply feed (`?parentId=&cursor=`) ────────────────────
    // A flat, keyset-paginated (oldest-first) page of one parent's direct
    // replies — the "load more replies" seam. Returns the same array-of-comments
    // shape; `X-Next-Cursor` carries the next page token.
    if (parentIdParam) {
      const replies = await fetchComments(
        { parentId: parentIdParam, ...ascKeysetWhere(decodeCursor(cursorParam)) },
        REPLY_PAGE,
        false,
      );
      const nodes: ResolvedComment[] = replies.map((c) => ({ ...resolveComment(c), replies: [] }));
      const last = replies[replies.length - 1];
      const nextCursor =
        replies.length === REPLY_PAGE && last ? encodeCursor(last.createdAt, last.id) : null;
      return Response.json(nodes, { headers: nextCursor ? { "X-Next-Cursor": nextCursor } : {} });
    }

    // ── Top-level page (keyset, newest-first) ────────────────────────────────
    const roots = await fetchComments(
      { parentId: null, ...keysetWhere(decodeCursor(cursorParam)) },
      TOP_LEVEL_PAGE,
      true,
    );
    const rootNodes: ResolvedComment[] = roots.map((c) => ({ ...resolveComment(c), replies: [] }));

    // Bounded breadth-first hydration of nested replies: each parent gets at most
    // REPLY_CAP_PER_PARENT direct replies (a DB-level `take`, so no single parent
    // can hog the budget), and the whole walk is capped by depth and total
    // parents expanded. A 100k-comment thread can therefore never fetch more than
    // a small bounded slice; truncated/deeper replies load via `?parentId=`.
    let frontier = rootNodes;
    let depth = 0;
    let expanded = 0;
    while (frontier.length > 0 && depth < MAX_TREE_DEPTH && expanded < MAX_EXPANDED_PARENTS) {
      const batch = frontier.slice(0, MAX_EXPANDED_PARENTS - expanded);
      expanded += batch.length;
      // One id-window query caps each parent to REPLY_CAP_PER_PARENT replies
      // (ROW_NUMBER per parent), then ONE hydrate with the full include —
      // replacing up to MAX_EXPANDED_PARENTS per-parent queries per level with 2
      // (perf audit §2.5). A parent's deeper/truncated replies still load via
      // `?parentId=`. Only ids come from raw SQL, so the include isn't duplicated.
      const batchIds = batch.map((parent) => parent.id);
      const cappedIdRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY "parentId" ORDER BY "createdAt" ASC, id ASC
          ) AS rn
          FROM "rmheet_comment"
          WHERE "rmheetId" = ${id} AND "parentId" IN (${Prisma.join(batchIds)})
        ) t WHERE t.rn <= ${REPLY_CAP_PER_PARENT}
      `);
      const cappedIds = cappedIdRows.map((r) => r.id);
      const replyRows = cappedIds.length
        ? await prisma.rMHarkComment.findMany({
            where: { id: { in: cappedIds } },
            orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
            include: commentInclude,
          })
        : [];
      // Group the hydrated replies by parent, preserving ascending order.
      const repliesByParent = new Map<string, CommentRow[]>();
      for (const rep of replyRows) {
        const key = rep.parentId ?? "";
        const list = repliesByParent.get(key) ?? [];
        list.push(rep);
        repliesByParent.set(key, list);
      }
      const next: ResolvedComment[] = [];
      for (const parent of batch) {
        for (const rep of repliesByParent.get(parent.id) ?? []) {
          const node: ResolvedComment = { ...resolveComment(rep), replies: [] };
          parent.replies.push(node);
          next.push(node);
        }
      }
      frontier = next;
      depth++;
    }

    const lastRoot = roots[roots.length - 1];
    const nextCursor =
      roots.length === TOP_LEVEL_PAGE && lastRoot
        ? encodeCursor(lastRoot.createdAt, lastRoot.id)
        : null;

    // Body stays a bare array of top-level comments (unchanged client contract);
    // the cursor is additive via a response header so existing consumers that
    // read the array still work.
    return Response.json(rootNodes, { headers: nextCursor ? { "X-Next-Cursor": nextCursor } : {} });
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

    // Enforce the author's reply control (anti-harassment). The author can
    // always reply to their own post.
    const target = await prisma.rMHark.findUnique({
      where: { id },
      select: { userId: true, replyControl: true, content: true },
    });
    if (!target) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }
    const mayReply = await canReplyToPost(
      { userId: target.userId, replyControl: target.replyControl as ReplyControl, content: target.content },
      session.user.id,
    );
    if (!mayReply) {
      return Response.json(
        { error: "The author limited who can reply to this post" },
        { status: 403 }
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

    // Maintain the parent comment's denormalized reply tally when this is a
    // reply. Atomic column increment (best-effort — the counter is reconciled
    // out-of-band, so a rare failure here must not fail the reply itself).
    if (parsed.data.parentId) {
      await prisma.rMHarkComment
        .update({ where: { id: parsed.data.parentId }, data: { replyCount: { increment: 1 } } })
        .catch(() => {});
    }

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
      reactions: [],
    }, { status: 201 });
  } catch (error) {
    console.error("Post comment error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
