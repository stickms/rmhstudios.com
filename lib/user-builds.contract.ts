/**
 * Contracts for /api/user-builds/** (redesign audit C1). Client-safe: request
 * types come from the zod schemas and response types from `user-builds-types`,
 * both by `import type`, so no zod ships to the client.
 *
 * Most of these routes authenticate by hand (session OR the rmhcode CLI token),
 * so they bind with `auth: 'none'` and parse their own input; the contract is
 * still what the client calls through.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  adminUpdateBuildSchema,
  createBuildSchema,
  createCommentSchema,
} from '@/lib/user-builds-schema';
import type { Build, BuildCategory, BuildComment } from '@/lib/user-builds-types';

export interface UserBuildsPage {
  items: Build[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type UserBuildsQuery = {
  cursor?: string;
  limit?: number;
  category?: string;
  technology?: string;
  search?: string;
  sort?: 'recent' | 'popular' | 'views';
  userId?: string;
  curated?: boolean;
};

export const listUserBuildsApi = endpoint<{ query: UserBuildsQuery; res: UserBuildsPage }>()({
  method: 'GET',
  path: '/api/user-builds',
});

/** 201. The saved build (a subset of the card fields; the rest are optional on `Build`). */
export const createUserBuildApi = endpoint<{
  body: z.input<typeof createBuildSchema>;
  res: Build;
}>()({ method: 'POST', path: '/api/user-builds' });

export const featuredUserBuildsApi = endpoint<{
  query: { limit?: number };
  res: { builds: Build[] };
}>()({ method: 'GET', path: '/api/user-builds/featured' });

export const userBuildCategoriesApi = endpoint<{ res: { categories: BuildCategory[] } }>()({
  method: 'GET',
  path: '/api/user-builds/categories',
});

/** Detail by id or slug. A paid build is `locked` (no readme/repo/demo) until unlocked. */
export const getUserBuildApi = endpoint<{ res: Build }>()({
  method: 'GET',
  path: '/api/user-builds/$id',
});

/** Admins may also send `isCurated`, `featured`, `userId` and `position`. */
export const updateUserBuildApi = endpoint<{
  body: z.input<typeof adminUpdateBuildSchema>;
  res: Build;
}>()({ method: 'PATCH', path: '/api/user-builds/$id' });

export const deleteUserBuildApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/user-builds/$id',
});

export const likeUserBuildApi = endpoint<{ res: { liked: boolean; likeCount: number } }>()({
  method: 'POST',
  path: '/api/user-builds/$id/like',
});

/** `viewCount` is -1 when the owner views their own build. */
export const viewUserBuildApi = endpoint<{ res: { success: true; viewCount: number } }>()({
  method: 'POST',
  path: '/api/user-builds/$id/view',
});

export const unlockUserBuildApi = endpoint<{
  res: {
    success: true;
    readme: string | null;
    repoUrl: string | null;
    demoUrl: string | null;
    alreadyUnlocked?: true;
  };
}>()({ method: 'POST', path: '/api/user-builds/$id/unlock' });

export const listBuildCommentsApi = endpoint<{
  query: { cursor?: string; limit?: number };
  res: { items: BuildComment[]; nextCursor: string | null; hasMore: boolean };
}>()({ method: 'GET', path: '/api/user-builds/$id/comments' });

/** 201. */
export const createBuildCommentApi = endpoint<{
  body: z.input<typeof createCommentSchema>;
  res: BuildComment;
}>()({ method: 'POST', path: '/api/user-builds/$id/comments' });
