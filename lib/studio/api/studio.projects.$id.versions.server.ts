import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { projectIdSchema } from '@/lib/studio/project-schema';
import { listProjectVersionsApi } from '@/lib/studio/project-history.contract';
import { listVersions } from '@/lib/studio/project-history.server';

const notFound = () => Response.json({ error: 'Project not found', code: 'not-found' }, { status: 404 });

/** GET the earlier versions of one of the member's cloud projects, newest first, without their JSON. */
export const route = apiRoute('/api/studio/projects/$id/versions', {
  GET: implement(listProjectVersionsApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const id = projectIdSchema.safeParse(params.id);
    if (!id.success) return notFound();
    const versions = await listVersions(userId, id.data);
    return versions ? { versions } : notFound();
  }),
});
