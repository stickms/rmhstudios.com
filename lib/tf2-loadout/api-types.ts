/**
 * The wire contract between the loadout builder and `/api/tf2-loadout/*`.
 * Shared by client code and the server routes (zod lives in `api-schema.ts`).
 */

import type { LoadoutSlots, TfClass } from './catalog-types';

export type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

export interface LoadoutAuthor {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
}

export interface LoadoutSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  tfClass: TfClass;
  visibility: Visibility;
  slots: LoadoutSlots;
  author: LoadoutAuthor | null;
  likeCount: number;
  forkCount: number;
  createdAt: string;
  updatedAt: string;
  forkOf: { id: string; slug: string; title: string } | null;
  liked: boolean;
}

export interface LoadoutDetail extends LoadoutSummary {
  isOwner: boolean;
}

export interface LoadoutListResponse {
  items: LoadoutSummary[];
  nextCursor: string | null;
}

export const LOADOUT_LIMITS = {
  /** Saved loadouts per account, across all classes. */
  maxPerUser: 100,
  maxTitle: 80,
  maxDescription: 2000,
} as const;
