import { getRequest } from '@tanstack/react-start/server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { auth } from '@/lib/auth';
import { games } from './games';
import { apps } from './apps';

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
}

async function getRecommendedUsers(viewerId: string | null): Promise<SidebarUser[]> {
  // Never recommend the viewer themselves, bots, or people they already follow.
  const following = viewerId
    ? await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })
    : [];
  const excludeIds = [...(viewerId ? [viewerId] : []), ...following.map((f) => f.followingId)];

  const users = await prisma.user.findMany({
    where: {
      OR: [{ handle: { not: null } }, { username: { not: null } }],
      isBot: false,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: {
      followers: {
        _count: 'desc',
      },
    },
    take: 5,
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

  return users.map((user) => {
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
}

async function getBlogPosts(): Promise<SidebarPost[]> {
  return prisma.blogPost.findMany({
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 4,
    select: {
      slug: true,
      title: true,
      date: true,
    },
  });
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
