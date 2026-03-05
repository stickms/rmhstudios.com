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
  repoUrl?: string | null;
  demoUrl?: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  featured: boolean;
  technologies: string[];
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
}

export type BuildSortOption = 'recent' | 'popular' | 'views';
