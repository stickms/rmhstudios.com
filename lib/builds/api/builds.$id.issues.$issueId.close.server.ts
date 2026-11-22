import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { closeBuildIssueApi } from '@/lib/builds/issues.contract';
import { closeIssue, readIssueBuild, refusedResponse } from '@/lib/builds/issues.server';

/** POST /api/builds/$id/issues/$issueId/close  the reporter closes their own open issue. */
export const route = apiRoute('/api/builds/$id/issues/$issueId/close', {
  POST: implement(closeBuildIssueApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    const build = await readIssueBuild(params.id, userId);
    if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
    const result = await closeIssue(build, params.issueId, userId);
    if (!result.ok) return refusedResponse(result);
    return { issue: result.issue };
  }),
});
