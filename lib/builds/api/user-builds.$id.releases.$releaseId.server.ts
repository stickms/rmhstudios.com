import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAuthenticatedUser } from '@/lib/rmhcode-auth';
import { deleteReleaseApi } from '@/lib/builds/releases.contract';
import { deleteRelease, findReleaseBuild } from '@/lib/builds/releases.server';

/** DELETE /api/user-builds/[id]/releases/[releaseId]: remove a release (owner only; session or CLI token). */
export const route = apiRoute('/api/user-builds/$id/releases/$releaseId', {
  DELETE: implement(
    deleteReleaseApi,
    {
      auth: 'optional',
      alternateAuth: async (request) => {
        const user = await getAuthenticatedUser(request, null);
        return user ? { userId: user.id, rateScope: user.id } : null;
      },
      rateLimit: { policy: 'write', scope: 'user', prefix: 'build-release-delete' },
    },
    async ({ params, userId }) => {
      if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const result = await deleteRelease(await findReleaseBuild(params.id), params.releaseId, userId);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return { success: true as const };
    },
  ),
});
