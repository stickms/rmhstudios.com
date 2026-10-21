import type { Prisma } from '@prisma/client';
import { userDisplaySelect } from '@/lib/user-display';

/**
 * The columns a build CARD needs — shared by `GET /api/user-builds` and
 * `GET /api/user-builds/featured`.
 *
 * Both used `include`, which selects every scalar on `user_build`, including
 * `readme` (a free-form markdown `Text`, often the largest column on the row)
 * and `price`/`isCurated`/`position`/`updatedAt`, for up to 50 cards a page —
 * none of which a card renders. The detail route (`/api/user-builds/$id`) is the
 * only place the readme is read.
 */
export function buildCardSelect(viewerId: string | null) {
  return {
    id: true,
    slug: true,
    title: true,
    description: true,
    thumbnailUrl: true,
    repoUrl: true,
    demoUrl: true,
    visibility: true,
    featured: true,
    technologies: true,
    likeCount: true,
    commentCount: true,
    viewCount: true,
    createdAt: true,
    publishedAt: true,
    user: { select: userDisplaySelect },
    category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
    tags: { select: { name: true } },
    ...(viewerId ? { likes: { where: { userId: viewerId }, select: { id: true } } } : {}),
  } satisfies Prisma.UserBuildSelect;
}
