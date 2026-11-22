import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { projectIdSchema } from '@/lib/studio/project-schema';
import { versionIdSchema } from '@/lib/studio/project-history';
import { getProjectVersionApi } from '@/lib/studio/project-history.contract';
import { getVersion } from '@/lib/studio/project-history.server';

const notFound = () => Response.json({ error: 'Version not found', code: 'not-found' }, { status: 404 });

/** GET one earlier version with its JSON (for Open as copy). Another member's version is a 404. */
export const route = apiRoute('/api/studio/projects/$id/versions/$versionId', {
  GET: implement(getProjectVersionApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const id = projectIdSchema.safeParse(params.id);
    const versionId = versionIdSchema.safeParse(params.versionId);
    if (!id.success || !versionId.success) return notFound();
    const version = await getVersion(userId, id.data, versionId.data);
    return version ? { version } : notFound();
  }),
});
