import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createRMHarkSchema } from "@/lib/rmhark-schema";
import type { FeedItem, FeedFilter } from "@/lib/feed-types";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { feedEventBus } from "@/lib/feed-sse";
import { parseHandles } from "@/lib/feed/mentions";
import { createNotification } from "@/lib/notifications.server";
import { grantAchievement, progressAchievement } from "@/lib/achievements/engine.server";
import { getActiveBan } from "@/lib/admin-audit.server";
import { getTimeline, type FeedSurface } from "@/lib/feed/timeline";
import { ownsFeedImageUrl } from "@/lib/storage/keys";

export const Route = createFileRoute('/api/rmharks')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const filter = (searchParams.get("filter") || "all") as FeedFilter;
    const search = searchParams.get("search");
    const feedParam = searchParams.get("feed");

    // Get current user session (optional, for liked/reposted status)
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in, that's fine
    }

    // Surface resolution. The Twitter-shaped name is `feed=following|foryou`;
    // we keep back-compat with the legacy `filter=friends` value so older
    // clients (or in-flight requests during a deploy) keep working.
    const surface: FeedSurface =
      feedParam === "following" || filter === "friends" ? "following" : "foryou";

    const result = await getTimeline({
      userId,
      surface,
      filter,
      cursor,
      limit,
      search,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Feed fetch error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
  POST: async ({ request }) => {
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
      prefix: "rmhark-create",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const parsed = createRMHarkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { content, poll, gifUrl, imageUrls, originalId, audience, unlockPrice } = parsed.data;

    if (imageUrls?.length && !imageUrls.every((u) => ownsFeedImageUrl(u, session.user.id))) {
      return Response.json({ error: "Invalid image reference" }, { status: 400 });
    }

    // Validate the quoted post exists (and isn't itself a quote, to avoid chains).
    let quotedOriginalId: string | null = null;
    if (originalId) {
      const orig = await prisma.rMHark.findUnique({
        where: { id: originalId },
        select: { id: true, deletedAt: true, originalId: true },
      });
      if (!orig || orig.deletedAt) {
        return Response.json({ error: "Quoted post not found" }, { status: 400 });
      }
      quotedOriginalId = orig.originalId ?? orig.id; // quote the root, not a quote
    }

    const rmhark = await prisma.$transaction(async (tx) => {
      const created = await tx.rMHark.create({
        data: {
          content: content.trim(),
          gifUrl: gifUrl ?? null,
          imageUrls: imageUrls ?? [],
          userId: session.user.id,
          originalId: quotedOriginalId,
          audience: audience ?? "PUBLIC",
          unlockPrice: unlockPrice && unlockPrice > 0 ? unlockPrice : null,
        },
        include: {
          user: { select: userDisplaySelect },
        },
      });

      if (quotedOriginalId) {
        await tx.rMHark.update({
          where: { id: quotedOriginalId },
          data: { repostCount: { increment: 1 } },
        });
      }

      if (poll) {
        await tx.rMHarkPoll.create({
          data: {
            rmheetId: created.id,
            question: poll.question.trim(),
            multiSelect: poll.multiSelect,
            closesAt: poll.durationHours
              ? new Date(Date.now() + poll.durationHours * 60 * 60 * 1000)
              : null,
            options: {
              create: poll.options.map((text, i) => ({
                text: text.trim(),
                position: i,
              })),
            },
          },
          include: { options: true },
        });
      }

      return created;
    });

    // Re-fetch with poll data if poll was created
    let pollData: FeedItem["poll"] | undefined;
    if (poll) {
      const createdPoll = await prisma.rMHarkPoll.findUnique({
        where: { rmheetId: rmhark.id },
        include: {
          options: { orderBy: { position: "asc" } },
        },
      });
      if (createdPoll) {
        pollData = {
          id: createdPoll.id,
          question: createdPoll.question,
          multiSelect: createdPoll.multiSelect,
          totalVotes: 0,
          options: createdPoll.options.map((o) => ({
            id: o.id,
            text: o.text,
            voteCount: 0,
          })),
          myVotes: [],
        };
      }
    }

    const item: FeedItem = {
      id: rmhark.id,
      type: "rmhark",
      createdAt: rmhark.createdAt.toISOString(),
      content: rmhark.content,
      user: resolveUser(rmhark.user),
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      viewCount: 0,
      liked: false,
      reposted: false,
      poll: pollData,
      gifUrl: rmhark.gifUrl ?? undefined,
      imageUrls: rmhark.imageUrls,
    };

    // Attach the quoted original so the card renders it inline immediately.
    if (quotedOriginalId) {
      const orig = await prisma.rMHark.findUnique({
        where: { id: quotedOriginalId },
        select: {
          id: true, content: true, createdAt: true, likeCount: true,
          commentCount: true, repostCount: true, viewCount: true,
          user: { select: userDisplaySelect },
        },
      });
      if (orig) {
        item.original = {
          id: orig.id,
          type: "rmhark",
          createdAt: orig.createdAt.toISOString(),
          content: orig.content,
          user: resolveUser(orig.user),
          likeCount: orig.likeCount,
          commentCount: orig.commentCount,
          repostCount: orig.repostCount,
          viewCount: orig.viewCount,
        };
      }
    }

    // Publish to the SSE bus. The stream endpoint targets this to each
    // viewer's follow graph using `authorId` (Phase 3) instead of blindly
    // prepending onto every open client.
    // Paid posts must broadcast a locked teaser — never the unlocked content,
    // since the SSE payload reaches the author's followers.
    const broadcastItem =
      unlockPrice && unlockPrice > 0
        ? { ...item, content: "", imageUrls: undefined, gifUrl: undefined, poll: undefined, locked: true, unlockPrice }
        : item;
    feedEventBus.publish({
      type: "rmhark.created",
      rmharkId: item.id,
      payload: broadcastItem,
      timestamp: item.createdAt,
      authorId: session.user.id,
    });

    // Notify mentioned users in real time (targeted SSE → toast on the client).
    // Best-effort: never let notification fan-out fail the post creation.
    try {
      const author = item.user;
      const handles = parseHandles(rmhark.content);
      if (author && handles.length > 0) {
        const mentioned = await prisma.user.findMany({
          where: {
            id: { not: session.user.id }, // don't notify self-mentions
            OR: handles.map((h) => ({ handle: { equals: h, mode: "insensitive" as const } })),
          },
          select: { id: true },
        });
        if (mentioned.length > 0) {
          feedEventBus.publish({
            type: "notification.mention",
            rmharkId: item.id,
            payload: { id: item.id },
            timestamp: item.createdAt,
            authorId: session.user.id,
            targetUserIds: mentioned.map((m) => m.id),
            notification: {
              rmharkId: item.id,
              preview: rmhark.content.slice(0, 120),
              author: {
                id: author.id,
                name: author.name ?? null,
                image: author.image ?? null,
                handle: author.handle ?? null,
              },
            },
          });

          // Persist the mentions so they appear in the notification center.
          const mentionLink = author.handle
            ? `/u/${author.handle}/post/${item.id}`
            : undefined;
          await Promise.all(
            mentioned.map((m) =>
              createNotification({
                userId: m.id,
                actorId: session.user.id,
                type: "MENTION",
                entityType: "rmhark",
                entityId: item.id,
                preview: rmhark.content,
                link: mentionLink,
              })
            )
          );
        }
      }
    } catch (err) {
      console.error("Mention notification error:", err);
    }

    // Achievements: posting milestones + night-owl easter egg (best-effort).
    try {
      const count = await prisma.rMHark.count({
        where: { userId: session.user.id, deletedAt: null },
      });
      await progressAchievement(session.user.id, "social.first_post", { setProgress: count });
      await progressAchievement(session.user.id, "social.posts_10", { setProgress: count });
      await progressAchievement(session.user.id, "social.posts_100", { setProgress: count });
      const hour = new Date().getHours();
      if (hour >= 2 && hour < 5) await grantAchievement(session.user.id, "special.night_owl");
    } catch (e) {
      console.error("post achievement error:", e);
    }

    return Response.json(item, { status: 201 });
  } catch (error) {
    console.error("Create RMHark error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
