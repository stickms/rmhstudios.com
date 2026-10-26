/**
 * The wire contract between the editor and `/api/tf2-hud/*`. Shared by client
 * code and the server routes (zod schemas live in `api-schema.ts`).
 */

export type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

export interface ManifestEntry {
  path: string;
  /** Lower-case hex SHA-1 of the file bytes; absent on tombstones. */
  sha1?: string;
  size?: number;
  /** The author deleted this file from the TF2 Default base. */
  deleted?: boolean;
}

export interface HudAuthor {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
}

export interface HudSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  author: HudAuthor | null;
  likeCount: number;
  forkCount: number;
  downloadCount: number;
  fileCount: number;
  totalBytes: number;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  forkOf: { id: string; slug: string; title: string } | null;
  liked: boolean;
}

export interface HudDetail extends HudSummary {
  manifest: ManifestEntry[];
  baseCommit: string;
  isOwner: boolean;
  /** Present for the owner when a share link exists. */
  shareToken: string | null;
  /** True when opened through a share token (read-only). */
  viaShare: boolean;
}

export interface VersionSummary {
  number: number;
  message: string;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
}

export interface HudListResponse {
  items: HudSummary[];
  nextCursor: string | null;
}

export const HUD_LIMITS = {
  maxFiles: 5000,
  maxBlobBytes: 25 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
  maxHudsPerUser: 100,
  maxTags: 8,
  maxVersionsKept: 100,
} as const;
