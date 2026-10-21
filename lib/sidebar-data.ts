import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { getRequestSession } from '@/lib/auth-session.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { cached } from '@/lib/cached.server';
import { games } from './games';
import { apps } from './apps';

// The sidebar (top builds, blog, recommended users) is on the home page's
// blocking loader — and the page component (and therefore the feed's first
// fetch) doesn't mount until this resolves. Its content changes slowly, so a
// short in-memory TTL keeps the loader off the DB on the hot path, which speeds
// up both the initial page render and the moment the feed starts loading.
const BUILDS_TTL = 60_000;
const BLOG_TTL = 120_000;
const RECOMMEND_TTL = 120_000;

type SidebarOfficialBuild = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  href: string;
  status?: string;
};

type SidebarBuild = {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  creator?: {
    id: string;
    handle: string | null;
    username: string | null;
    name: string | null;
    image: string | null;
  };
};

type SidebarUser = {
  id: string;
  handle: string | null;
  username: string | null;
  name: string | null;
  image: string | null;
  followerCount: number;
};

type SidebarPost = {
  slug: string;
  title: string;
  date: string;
};

function getOfficialBuilds(): SidebarOfficialBuild[] {
  const allBuilds = [
    ...games.filter((g) => !g.unlisted).slice(0, 2),
    ...apps.filter((a) => !a.hidden && !a.unlisted).slice(0, 2),
  ];
  return allBuilds.map((b) => ({
    id: b.id,
    title: b.title,
    thumbnailUrl: b.imagePath || null,
    href: b.href,
    status: b.status,
  }));
}

async function getUserBuilds(): Promise<SidebarBuild[]> {
  // Global key, shared across instances via L1+L2 so all replicas reuse one warm
  // copy instead of each recomputing this scan.
  return cached<SidebarBuild[]>('sidebar:userBuilds', BUILDS_TTL, async () => {
    const builds = await prisma.userBuild.findMany({
      where: {
        isCurated: false,
        visibility: 'PUBLIC',
      },
      orderBy: [{ likeCount: 'desc' }, { viewCount: 'desc' }, { publishedAt: 'desc' }],
      take: 3,
      select: {
        id: true,
        slug: true,
        title: true,
        thumbnailUrl: true,
        likeCount: true,
        commentCount: true,
        viewCount: true,
        user: {
          select: {
            id: true,
            handle: true,
            username: true,
            name: true,
            image: true,
            profile: {
              select: {
                displayName: true,
                customImage: true,
              },
            },
          },
        },
      },
    });

    return builds.map((build) => {
      const resolved = resolveUserDisplay(build.user);
      return {
        id: build.id,
        slug: build.slug,
        title: build.title,
        thumbnailUrl: build.thumbnailUrl,
        likeCount: build.likeCount,
        commentCount: build.commentCount,
        viewCount: build.viewCount,
        creator: {
          id: build.user.id,
          handle: build.user.handle,
          username: build.user.username,
          name: resolved.name,
          image: resolved.image,
        },
      };
    });
  });
}

// Ranking every non-bot user by follower count is the expensive part and is
// viewer-independent, so compute a candidate pool once per TTL and reuse it.
async function getRecommendCandidates(): Promise<SidebarUser[]> {
  // Global key, shared across instances via L1+L2.
  return cached<SidebarUser[]>('sidebar:recommendPool', RECOMMEND_TTL, async () => {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ handle: { not: null } }, { username: { not: null } }],
        isBot: false,
      },
      // Sort by the denormalized, indexed follower count instead of aggregating
      // the follow relation — fast even when the cache is cold.
      orderBy: {
        followerCount: 'desc',
      },
      // A pool (not just 5) so the per-viewer exclusion below still yields
      // recommendations for viewers who already follow the very top accounts.
      take: 20,
      select: {
        id: true,
        name: true,
        username: true,
        handle: true,
        image: true,
        followerCount: true,
        profile: {
          select: {
            displayName: true,
            customImage: true,
          },
        },
      },
    });

    return users.map((user) => {
      const resolved = resolveUserDisplay(user);
      return {
        id: user.id,
        handle: user.handle,
        username: user.username,
        name: resolved.name,
        image: resolved.image,
        followerCount: user.followerCount,
      };
    });
  });
}

async function getRecommendedUsers(viewerId: string | null): Promise<SidebarUser[]> {
  const pool = await getRecommendCandidates();
  // Never recommend the viewer themselves or people they already follow.
  if (!viewerId) return pool.slice(0, 4);

  // Shared cached follow graph — the feed read on the same page already warmed it.
  const followingIds = await getFollowingIds(viewerId);
  const exclude = new Set<string>([viewerId, ...followingIds]);
  return pool.filter((u) => !exclude.has(u.id)).slice(0, 4);
}

async function getBlogPosts(): Promise<SidebarPost[]> {
  // Global key, shared across instances via L1+L2.
  return cached<SidebarPost[]>('sidebar:blogPosts', BLOG_TTL, async () => {
    return prisma.blogPost.findMany({
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      select: {
        slug: true,
        title: true,
        date: true,
      },
    });
  });
}

export async function getSidebarData() {
  // Resolve the viewer so recommendations can exclude self / already-followed.
  // Request-scoped: reuses the session already resolved by the root/page loader
  // on the same render instead of issuing another Better Auth + entitlement read.
  const session = await getRequestSession();
  const viewerId: string | null = session?.user?.id ?? null;

  const [userBuilds, recommendedUsers, blogPosts] = await Promise.all([
    getUserBuilds(),
    getRecommendedUsers(viewerId),
    getBlogPosts(),
  ]);

  return {
    officialBuilds: getOfficialBuilds(),
    userBuilds,
    recommendedUsers,
    blogPosts,
  };
}
