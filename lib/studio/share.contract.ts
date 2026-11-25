/**
 * Contracts for sharing a Studio project (`/api/studio/shares`). Client-safe: types come from the zod schemas by
 * `import type`, so no zod ships. No endpoint takes a share id: the token is the only handle, for the sharer's own
 * list and revoke as much as for a visitor's read.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { StudioProjectData } from '@/lib/studio/projects.contract';
import type { createShareBody } from '@/lib/studio/share-schema';

/** One of the member's own shares, for the "Shared links" list. */
export interface ShareSummary {
  token: string;
  name: string;
  trackCount: number;
  /** Audio clips that need a sample of the opener's own. */
  missingSamples: number;
  openCount: number;
  createdAt: string;
  /** Stopped sharing (or taken down): the row stays for the list, the link no longer works. */
  revoked: boolean;
}

/** What a visitor sees of a share: the project and the sharer's display name, nothing else about them. */
export interface SharedProject {
  name: string;
  sharerName: string | null;
  trackCount: number;
  missingSamples: number;
  data: StudioProjectData;
}

export const listSharesApi = endpoint<{
  res: { shares: ShareSummary[]; limit: number };
}>()({ method: 'GET', path: '/api/studio/shares' });

export const createShareApi = endpoint<{
  body: z.infer<typeof createShareBody>;
  res: { share: ShareSummary };
}>()({ method: 'POST', path: '/api/studio/shares' });

/** Read a share by its token. One 404 for a revoked, hidden or unknown token. */
export const readShareApi = endpoint<{
  res: { share: SharedProject };
}>()({ method: 'GET', path: '/api/studio/shares/$token' });

export const revokeShareApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/studio/shares/$token' });
