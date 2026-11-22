import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { projectIdSchema } from '@/lib/studio/project-schema';
import { restoreVersionBody, versionIdSchema } from '@/lib/studio/project-history';
import { restoreProjectVersionApi } from '@/lib/studio/project-history.contract';
import { restoreVersion } from '@/lib/studio/cloud-projects.server';
import { refusalResponse } from '@/lib/studio/refusal.server';

const notFound = () => Response.json({ error: 'Version not found', code: 'not-found' }, { status: 404 });

/** POST restore an earlier version as a new save, naming the revision the caller last saw (stale is a 409). */
export const route = apiRoute('/api/studio/projects/$id/versions/$versionId/restore', {
  POST: implement(
    restoreProjectVersionApi,
    { rateLimit: 'write', body: restoreVersionBody },
    async ({ userId, params, body }) => {
      const id = projectIdSchema.safeParse(params.id);
      const versionId = versionIdSchema.safeParse(params.versionId);
      if (!id.success || !versionId.success) return notFound();
      const result = await restoreVersion(userId, id.data, versionId.data, body.baseRevision);
      return result.ok ? { project: result.project } : refusalResponse(result);
    },
  ),
});
