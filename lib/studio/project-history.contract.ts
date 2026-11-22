/**
 * Contracts for earlier versions of a cloud Studio project. Client-safe: types only from the zod schemas.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { restoreVersionBody } from '@/lib/studio/project-history';
import type { CloudProjectSummary, StudioProjectData } from '@/lib/studio/projects.contract';

/** A version without its JSON: what the Versions list shows. */
export interface ProjectVersionSummary {
  id: string;
  /** The project revision this data had. */
  revision: number;
  name: string;
  /** ISO time this version was saved. */
  savedAt: string;
  sizeBytes: number;
  trackCount: number;
}

export interface ProjectVersion extends ProjectVersionSummary {
  data: StudioProjectData;
}

export const listProjectVersionsApi = endpoint<{
  res: { versions: ProjectVersionSummary[] };
}>()({ method: 'GET', path: '/api/studio/projects/$id/versions' });

export const getProjectVersionApi = endpoint<{
  res: { version: ProjectVersion };
}>()({ method: 'GET', path: '/api/studio/projects/$id/versions/$versionId' });

export const restoreProjectVersionApi = endpoint<{
  body: z.infer<typeof restoreVersionBody>;
  res: { project: CloudProjectSummary };
}>()({ method: 'POST', path: '/api/studio/projects/$id/versions/$versionId/restore' });
