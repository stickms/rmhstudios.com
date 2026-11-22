/**
 * Contracts for the Studio's cloud projects (`/api/studio/projects`). Client-safe: types come from the zod schemas
 * by `import type`, so no zod ships.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createProjectBody, studioProjectSchema, updateProjectBody } from '@/lib/studio/project-schema';

export type StudioProjectData = z.infer<typeof studioProjectSchema>;

/** A cloud project without its JSON: what the Open list shows. */
export interface CloudProjectSummary {
  id: string;
  name: string;
  sizeBytes: number;
  /** Bumped by every save; the next save names the one it started from. */
  revision: number;
  /** ISO time of the last save. */
  updatedAt: string;
}

export interface CloudProject extends CloudProjectSummary {
  data: StudioProjectData;
}

/**
 * Why a cloud save was refused, in the `code` field of the error body. `stale` and `exists` carry the current
 * `revision`; the rest carry nothing about another member's rows.
 */
export type CloudSaveRefusal = 'stale' | 'exists' | 'id-taken' | 'limit' | 'too-large' | 'not-found';

export const listCloudProjectsApi = endpoint<{
  res: { projects: CloudProjectSummary[]; limit: number };
}>()({ method: 'GET', path: '/api/studio/projects' });

export const createCloudProjectApi = endpoint<{
  body: z.infer<typeof createProjectBody>;
  res: { project: CloudProjectSummary };
}>()({ method: 'POST', path: '/api/studio/projects' });

export const getCloudProjectApi = endpoint<{
  res: { project: CloudProject };
}>()({ method: 'GET', path: '/api/studio/projects/$id' });

export const updateCloudProjectApi = endpoint<{
  body: z.infer<typeof updateProjectBody>;
  res: { project: CloudProjectSummary };
}>()({ method: 'PUT', path: '/api/studio/projects/$id' });

export const deleteCloudProjectApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/studio/projects/$id' });
