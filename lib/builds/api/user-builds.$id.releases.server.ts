import { refusalBody, refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAuthenticatedUser } from '@/lib/rmhcode-auth';
import { RELEASE_CREATE_LIMIT } from '@/lib/builds/releases';
import { createReleaseApi, listReleasesApi } from '@/lib/builds/releases.contract';
import { createReleaseBody } from '@/lib/builds/releases-schema';
import { createRelease, findReleaseBuild, listReleases, notifyRelease } from '@/lib/builds/releases.server';

/**
 * GET  /api/user-builds/[id]/releases  the latest releases (a private build's are its owner's alone)
 * POST /api/user-builds/[id]/releases  publish one (owner only; 10 an hour per member)
 *
 * The caller is a session or an rmhcode CLI token, so the routes take `auth: 'optional'` and name the token as the
 * second way to identify a caller (`alternateAuth`); the rate limit is then per member either way.
 */
const cliToken = async (request: Request) => {
  const user = await getAuthenticatedUser(request, null);
  return user ? { userId: user.id, rateScope: user.id } : null;
};

export const route = apiRoute('/api/user-builds/$id/releases', {
  GET: implement(
    listReleasesApi,
    { auth: 'optional', alternateAuth: cliToken, rateLimit: 'read' },
    async ({ params, userId }) => {
      const build = await findReleaseBuild(params.id);
      const items = build ? await listReleases(build.id, userId) : null;
      if (!items) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      return { items };
    },
  ),
  POST: implement(
    createReleaseApi,
    {
      auth: 'optional',
      alternateAuth: cliToken,
      rateLimit: { policy: 'write', scope: 'user', prefix: 'build-release-create', ...RELEASE_CREATE_LIMIT },
      body: createReleaseBody,
      verboseValidationErrors: true,
    },
    async ({ params, userId, body }) => {
      if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const build = await findReleaseBuild(params.id);
      const result = await createRelease(build, userId, body);
      if (!result.ok)
        return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
      // After the write, not awaited: a slow or failing notification never delays or fails the publish.
      if (build) void notifyRelease(build, result.release).catch(() => {});
      return Response.json({ release: result.release }, { status: 201 });
    },
  ),
});
