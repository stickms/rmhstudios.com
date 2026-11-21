import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteCloudProject,
  getCloudProject,
  saveCloudProject,
} from '@/lib/studio/cloud-projects.server';
import { refusalResponse } from '@/lib/studio/refusal.server';
import {
  MAX_REQUEST_BYTES,
  projectIdSchema,
  updateProjectBody,
} from '@/lib/studio/project-schema';
import {
  deleteCloudProjectApi,
  getCloudProjectApi,
  updateCloudProjectApi,
} from '@/lib/studio/projects.contract';

const notFound = () => Response.json({ error: 'Project not found', code: 'not-found' }, { status: 404 });

/** GET one cloud project with its JSON, PUT a revision-checked replacement, DELETE it. All own-rows only. */
export const route = apiRoute('/api/studio/projects/$id', {
  GET: implement(getCloudProjectApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const id = projectIdSchema.safeParse(params.id);
    if (!id.success) return notFound();
    const project = await getCloudProject(userId, id.data);
    return project ? { project } : notFound();
  }),

  PUT: implement(
    updateCloudProjectApi,
    { rateLimit: 'write', body: updateProjectBody, maxBodyBytes: MAX_REQUEST_BYTES },
    async ({ userId, params, body }) => {
      const id = projectIdSchema.safeParse(params.id);
      if (!id.success) return notFound();
      if (body.data.id !== id.data) {
        return Response.json({ error: 'Project id mismatch' }, { status: 400 });
      }
      const result = await saveCloudProject(userId, {
        id: id.data,
        name: body.name,
        data: body.data,
        baseRevision: body.baseRevision,
      });
      return result.ok ? { project: result.project } : refusalResponse(result);
    },
  ),

  DELETE: implement(deleteCloudProjectApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const id = projectIdSchema.safeParse(params.id);
    if (!id.success) return notFound();
    return (await deleteCloudProject(userId, id.data)) ? { success: true as const } : notFound();
  }),
});
