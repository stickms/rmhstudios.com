import { getRequest } from '@tanstack/react-start/server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { auth } from '@/lib/auth';
import { apiCache } from '@/lib/cache';
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
    ...games.filter(g => !g.unlisted).slice(0, 2),
    ...apps.filter(a => !a.hidden && !a.unlisted).slice(0, 2),
  ];
  return allBuilds.map(b => ({
    id: b.id,
    title: b.title,
    thumbnailUrl: b.imagePath || null,
    href: b.href,
    status: b.status,
  }));
}

async function getUserBuilds(): Promise<SidebarBuild[]> {
  const cached = apiCache.get<SidebarBuild[]>('sidebar:userBuilds');
  if (cached) return cached;

  const builds = await prisma.userBuild.findMany({
    where: {
      isCurated: false,
      visibility: 'PUBLIC',
    },
    orderBy: [
      { likeCount: 'desc' },
      { viewCount: 'desc' },
      { publishedAt: 'desc' },
    ],
    take: 4,
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

  const result = builds.map((build) => {
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

  apiCache.set('sidebar:userBuilds', result, BUILDS_TTL);
  return result;
}

// Ranking every non-bot user by follower count is the expensive part and is
// viewer-independent, so compute a candidate pool once per TTL and reuse it.
async function getRecommendCandidates(): Promise<SidebarUser[]> {
  const cached = apiCache.get<SidebarUser[]>('sidebar:recommendPool');
  if (cached) return cached;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ handle: { not: null } }, { username: { not: null } }],
      isBot: false,
    },
    orderBy: {
      followers: {
        _count: 'desc',
      },
    },
    // A pool (not just 5) so the per-viewer exclusion below still yields
    // recommendations for viewers who already follow the very top accounts.
    take: 30,
    select: {
      id: true,
      name: true,
      username: true,
      handle: true,
      image: true,
      profile: {
        select: {
          displayName: true,
          customImage: true,
        },
      },
      _count: {
        select: {
          followers: true,
        },
      },
    },
  });

  const pool = users.map((user) => {
    const resolved = resolveUserDisplay(user);
    return {
      id: user.id,
      handle: user.handle,
      username: user.username,
      name: resolved.name,
      image: resolved.image,
      followerCount: user._count.followers,
    };
  });

  apiCache.set('sidebar:recommendPool', pool, RECOMMEND_TTL);
  return pool;
}

async function getRecommendedUsers(viewerId: string | null): Promise<SidebarUser[]> {
  const pool = await getRecommendCandidates();
  // Never recommend the viewer themselves or people they already follow.
  if (!viewerId) return pool.slice(0, 5);

  const following = await prisma.follow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  });
  const exclude = new Set<string>([viewerId, ...following.map((f) => f.followingId)]);
  return pool.filter((u) => !exclude.has(u.id)).slice(0, 5);
}

async function getBlogPosts(): Promise<SidebarPost[]> {
  const cached = apiCache.get<SidebarPost[]>('sidebar:blogPosts');
  if (cached) return cached;

  const posts = await prisma.blogPost.findMany({
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 4,
    select: {
      slug: true,
      title: true,
      date: true,
    },
  });

  apiCache.set('sidebar:blogPosts', posts, BLOG_TTL);
  return posts;
}

export async function getSidebarData() {
  // Resolve the viewer so recommendations can exclude self / already-followed.
  let viewerId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    viewerId = session?.user?.id ?? null;
  } catch {
    viewerId = null;
  }

  const [userBuilds, recommendedUsers, blogPosts] =
    await Promise.all([
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
