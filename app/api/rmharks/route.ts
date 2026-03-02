import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createRMHarkSchema } from "@/lib/rmhark-schema";
import { games } from "@/lib/games";
import { apps } from "@/lib/apps";
import { getAllPosts } from "@/lib/blog";
import { getAllNewsArticles } from "@/lib/news";
import { getAllArticles } from "@/lib/research";
import type { FeedItem, FeedFilter } from "@/lib/feed-types";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const runtime = "nodejs";

function deduplicateReposts(items: FeedItem[], windowSize = 2): FeedItem[] {
  const result: FeedItem[] = [];
  for (const item of items) {
    if (item.repostedBy) {
      const underlyingId = item.actualId ?? item.id;
      const recentIds = result.slice(-windowSize).map((i) => i.actualId ?? i.id);
      if (recentIds.includes(underlyingId)) continue;
    }
    result.push(item);
  }
  return result;
}

/** Build "virtual" announcement feed items from static data sources. */
async function getAnnouncementItems(filter: FeedFilter): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  if (filter === "all" || filter === "game") {
    for (const g of games) {
      items.push({
        id: `game:${g.id}`,
        type: "game_announcement",
        createdAt: "2025-01-01T00:00:00.000Z",
        title: g.title,
        description: g.description,
        href: g.href,
        imagePath: g.imagePath,
        tags: g.tags,
        gradient: g.gradient,
        iconName: g.iconName,
      });
    }
  }

  if (filter === "all" || filter === "app") {
    for (const a of apps) {
      if (a.hidden) continue;
      items.push({
        id: `app:${a.id}`,
        type: "app_announcement",
        createdAt: "2025-01-01T00:00:00.000Z",
        title: a.title,
        description: a.description,
        href: a.href,
        imagePath: a.imagePath,
        tags: a.tags,
        gradient: a.gradient,
        iconName: a.iconName,
      });
    }
  }

  if (filter === "all" || filter === "news") {
    const newsArticles = await getAllNewsArticles();
    for (const n of newsArticles) {
      items.push({
        id: `news:${n.slug}`,
        type: "news",
        createdAt: n.date ? new Date(n.date).toISOString() : "2025-01-01T00:00:00.000Z",
        title: n.title,
        description: n.description,
        href: `/news/${n.slug}`,
        imagePath: n.image ?? undefined,
        category: n.category,
        sourcePublisher: n.sourcePublisher,
      });
    }
  }

  if (filter === "all" || filter === "blog") {
    const posts = getAllPosts(["title", "date", "slug", "description", "image", "tags"]);
    for (const p of posts) {
      items.push({
        id: `blog:${p.slug}`,
        type: "blog",
        createdAt: p.date ? new Date(p.date).toISOString() : "2025-01-01T00:00:00.000Z",
        title: p.title,
        description: p.description,
        href: `/blog/${p.slug}`,
        imagePath: p.image,
        tags: p.tags as unknown as string[] | undefined,
      });
    }
  }

  if (filter === "all" || filter === "research") {
    const research = getAllArticles();
    for (const r of research) {
      items.push({
        id: `research:${r.slug}`,
        type: "research",
        createdAt: new Date(r.date).toISOString(),
        title: r.title,
        description: r.abstract.slice(0, 200) + "...",
        href: `/research/${r.slug}`,
        tags: r.keywords.slice(0, 3),
        gradient: r.heroColor,
        iconName: r.iconName,
        category: r.category,
      });
    }
  }

  return items;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const filter = (searchParams.get("filter") || "all") as FeedFilter;

    // Get current user session (optional, for liked/reposted status)
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in, that's fine
    }

    // Handle "friends" filter: only posts from followed users
    if (filter === "friends") {
      if (!userId) {
        return NextResponse.json({ items: [], nextCursor: null, hasMore: false });
      }

      const followRecords = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const followingIds = followRecords.map((f) => f.followingId);

      if (followingIds.length === 0) {
        return NextResponse.json({ items: [], nextCursor: null, hasMore: false });
      }

      const cursorDate = cursor ? new Date(cursor) : undefined;
      const rmharkInclude = {
        user: { select: userDisplaySelect },
        _count: { select: { likes: true, comments: true, reposts: true, views: true } },
        likes: { where: { userId }, select: { id: true } },
        reposts: { where: { userId }, select: { id: true } },
        original: {
          include: {
            user: { select: userDisplaySelect },
            _count: { select: { likes: true, comments: true, reposts: true, views: true } },
          },
        },
      } as const;

      const [rmharks, repostRecords] = await Promise.all([
        prisma.rMHark.findMany({
          where: {
            userId: { in: followingIds },
            ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: rmharkInclude,
        }),
        prisma.rMHarkRepost.findMany({
          where: {
            userId: { in: followingIds },
            ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            user: { select: userDisplaySelect },
            rmhark: { include: rmharkInclude },
          },
        }),
      ]);

      const mapOriginal = (o: typeof rmharks[0]["original"]) =>
        o
          ? {
              id: o.id,
              type: "rmhark" as const,
              createdAt: o.createdAt.toISOString(),
              content: o.content,
              user: resolveUser(o.user),
              likeCount: o._count.likes,
              commentCount: o._count.comments,
              repostCount: o._count.reposts,
              viewCount: o._count.views,
            }
          : undefined;

      const ownItems: FeedItem[] = rmharks.map((r) => ({
        id: r.id,
        type: "rmhark" as const,
        createdAt: r.createdAt.toISOString(),
        content: r.content,
        user: resolveUser(r.user),
        likeCount: r._count.likes,
        commentCount: r._count.comments,
        repostCount: r._count.reposts,
        viewCount: r._count.views,
        liked: r.likes.length > 0,
        reposted: r.reposts.length > 0,
        original: mapOriginal(r.original),
      }));

      const repostItems: FeedItem[] = repostRecords.map((rp) => {
        const r = rp.rmhark;
        return {
          id: `repost:${rp.id}`,
          type: "rmhark" as const,
          createdAt: rp.createdAt.toISOString(),
          actualId: r.id,
          content: r.content,
          user: resolveUser(r.user),
          likeCount: r._count.likes,
          commentCount: r._count.comments,
          repostCount: r._count.reposts,
          viewCount: r._count.views,
          liked: r.likes.length > 0,
          reposted: r.reposts.length > 0,
          repostedBy: resolveUser(rp.user),
          original: mapOriginal(r.original),
        };
      });

      const friendsItems = deduplicateReposts(
        [...ownItems, ...repostItems].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      ).slice(0, limit);

      const nextCursor =
        friendsItems.length === limit
          ? friendsItems[friendsItems.length - 1].createdAt
          : null;

      return NextResponse.json({
        items: friendsItems,
        nextCursor,
        hasMore: friendsItems.length === limit,
      });
    }

    // Fetch RMHarks from DB
    const shouldFetchRmheets = filter === "all" || filter === "rmhark";
    let dbItems: FeedItem[] = [];
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const rmharkInclude = {
      user: { select: userDisplaySelect },
      _count: { select: { likes: true, comments: true, reposts: true, views: true } },
      ...(userId
        ? {
            likes: { where: { userId }, select: { id: true } },
            reposts: { where: { userId }, select: { id: true } },
          }
        : {}),
      original: {
        include: {
          user: { select: userDisplaySelect },
          _count: { select: { likes: true, comments: true, reposts: true, views: true } },
        },
      },
    } as const;

    if (shouldFetchRmheets) {
      const [rmharks, repostRecords] = await Promise.all([
        prisma.rMHark.findMany({
          where: cursorDate ? { createdAt: { lt: cursorDate } } : undefined,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: rmharkInclude,
        }),
        prisma.rMHarkRepost.findMany({
          where: cursorDate ? { createdAt: { lt: cursorDate } } : undefined,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            user: { select: userDisplaySelect },
            rmhark: { include: rmharkInclude },
          },
        }),
      ]);

      const mapOriginal = (o: typeof rmharks[0]["original"]) =>
        o
          ? {
              id: o.id,
              type: "rmhark" as const,
              createdAt: o.createdAt.toISOString(),
              content: o.content,
              user: resolveUser(o.user),
              likeCount: o._count.likes,
              commentCount: o._count.comments,
              repostCount: o._count.reposts,
              viewCount: o._count.views,
            }
          : undefined;

      const ownItems: FeedItem[] = rmharks.map((r) => ({
        id: r.id,
        type: "rmhark" as const,
        createdAt: r.createdAt.toISOString(),
        content: r.content,
        user: resolveUser(r.user),
        likeCount: r._count.likes,
        commentCount: r._count.comments,
        repostCount: r._count.reposts,
        viewCount: r._count.views,
        liked: userId ? r.likes.length > 0 : false,
        reposted: userId ? r.reposts.length > 0 : false,
        original: mapOriginal(r.original),
      }));

      const repostItems: FeedItem[] = repostRecords.map((rp) => {
        const r = rp.rmhark;
        return {
          id: `repost:${rp.id}`,
          type: "rmhark" as const,
          createdAt: rp.createdAt.toISOString(),
          actualId: r.id,
          content: r.content,
          user: resolveUser(r.user),
          likeCount: r._count.likes,
          commentCount: r._count.comments,
          repostCount: r._count.reposts,
          viewCount: r._count.views,
          liked: userId ? r.likes.length > 0 : false,
          reposted: userId ? r.reposts.length > 0 : false,
          repostedBy: resolveUser(rp.user),
          original: mapOriginal(r.original),
        };
      });

      dbItems = deduplicateReposts(
        [...ownItems, ...repostItems].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      ).slice(0, limit);
    }

    // Get announcement items
    const announcements = await getAnnouncementItems(filter);

    // Filter announcements by cursor
    let filteredAnnouncements = announcements;
    if (cursor) {
      filteredAnnouncements = announcements.filter(
        (a) => new Date(a.createdAt) < new Date(cursor)
      );
    }

    let paginatedItems: FeedItem[];

    if (filter === "all") {
      // Interleave: 3 RMHarks per 1 announcement to prioritize user content
      const sortedAnnouncements = filteredAnnouncements.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const result: FeedItem[] = [];
      let ri = 0;
      let ai = 0;

      while (result.length < limit && (ri < dbItems.length || ai < sortedAnnouncements.length)) {
        // Add up to 3 RMHarks
        for (let i = 0; i < 3 && ri < dbItems.length && result.length < limit; i++) {
          result.push(dbItems[ri++]);
        }
        // Add 1 announcement
        if (ai < sortedAnnouncements.length && result.length < limit) {
          result.push(sortedAnnouncements[ai++]);
        }
      }

      paginatedItems = result;
    } else {
      // Specific filter: merge and sort by date (no interleaving needed)
      const allItems = [...dbItems, ...filteredAnnouncements].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      paginatedItems = allItems.slice(0, limit);
    }

    const nextCursor =
      paginatedItems.length === limit
        ? paginatedItems[paginatedItems.length - 1].createdAt
        : null;

    return NextResponse.json({
      items: paginatedItems,
      nextCursor,
      hasMore: paginatedItems.length === limit,
    });
  } catch (error) {
    console.error("Feed fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "rmhark-create",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();
    const parsed = createRMHarkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const rmhark = await prisma.rMHark.create({
      data: {
        content: parsed.data.content.trim(),
        userId: session.user.id,
      },
      include: {
        user: { select: userDisplaySelect },
      },
    });

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
    };

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Create RMHark error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
