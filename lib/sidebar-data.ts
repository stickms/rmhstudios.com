import { prisma } from '@/lib/prisma';
import { resolveUserDisplay } from '@/lib/user-display';

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

async function getCuratedBuilds(): Promise<SidebarBuild[]> {
  return prisma.userBuild.findMany({
    where: {
      isCurated: true,
      visibility: 'PUBLIC',
    },
    orderBy: [
      { position: 'asc' },
      { likeCount: 'desc' },
      { viewCount: 'desc' },
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
    },
  });
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

async function getRecommendedUsers(): Promise<SidebarUser[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ handle: { not: null } }, { username: { not: null } }],
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
  const [curatedBuilds, userBuilds, recommendedUsers, blogPosts] =
    await Promise.all([
      getCuratedBuilds(),
      getUserBuilds(),
      getRecommendedUsers(),
      getBlogPosts(),
    ]);

  return {
    curatedBuilds,
    userBuilds,
    recommendedUsers,
    blogPosts,
  };
}
