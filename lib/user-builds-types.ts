/**
 * Type definitions for User Builds
 */

export interface BuildUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  handle?: string | null;
}

export interface BuildCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  iconName?: string | null;
  color?: string | null;
  buildCount?: number;
}

export interface BuildVersion {
  id: string;
  version: string;
  changelog?: string | null;
  commitHash?: string | null;
  createdAt: string;
}

export interface Build {
  id: string;
  slug: string;
  title: string;
  description: string;
  readme?: string | null;
  thumbnailUrl?: string | null;
  /** s07-17: describes the cover; the title stands in when it is empty. */
  thumbnailAlt?: string | null;
  /** s07-17: the described screenshots in order; carried by the build page and the single-build read only. */
  screenshots?: {
    url: string;
    width: number;
    height: number;
    description: string;
  }[];
  repoUrl?: string | null;
  demoUrl?: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  featured: boolean;
  technologies: string[];
  /** Catalog id of the title this build was made for, if any. */
  gameId?: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string | null;
  user: BuildUser;
  category?: BuildCategory | null;
  tags: string[];
  versions?: BuildVersion[];
  liked?: boolean;
  isOwner?: boolean;
  // Marketplace: coin price to unlock readme/repo/demo (0 = free).
  price?: number;
  locked?: boolean;
  unlocked?: boolean;
}

export interface BuildComment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  user: BuildUser;
  parentId?: string | null;
  replyCount?: number;
  replies?: BuildComment[];
  /** s06-14: set once the author has edited it. */
  edited?: boolean;
  /** s06-14: how to draw it; absent means `visible`. A `deleted` comment has no text. */
  state?: 'visible' | 'hidden' | 'hidden-own' | 'deleted';
  /** s06-14: what the viewer may do, computed on the server. */
  canEdit?: boolean;
  canDelete?: boolean;
  canHide?: boolean;
  canReport?: boolean;
}

export type BuildSortOption = 'recent' | 'popular' | 'views';
