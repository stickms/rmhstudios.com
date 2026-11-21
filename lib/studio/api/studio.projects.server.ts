import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listCloudProjects, saveCloudProject } from '@/lib/studio/cloud-projects.server';
import { refusalResponse } from '@/lib/studio/refusal.server';
import {
  createProjectBody,
  MAX_CLOUD_PROJECTS,
  MAX_REQUEST_BYTES,
} from '@/lib/studio/project-schema';
import {
  createCloudProjectApi,
  listCloudProjectsApi,
} from '@/lib/studio/projects.contract';

/** GET /api/studio/projects: the member's cloud projects (no JSON). POST: save a project to the account. */
export const route = apiRoute('/api/studio/projects', {
  GET: implement(listCloudProjectsApi, { rateLimit: 'read' }, async ({ userId }) => ({
    projects: await listCloudProjects(userId),
    limit: MAX_CLOUD_PROJECTS,
  })),

  POST: implement(
    createCloudProjectApi,
    { rateLimit: 'write', body: createProjectBody, maxBodyBytes: MAX_REQUEST_BYTES },
    async ({ userId, body }) => {
      const result = await saveCloudProject(userId, body);
      return result.ok ? { project: result.project } : refusalResponse(result);
    },
  ),
});
