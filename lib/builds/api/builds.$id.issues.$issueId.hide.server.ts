import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { hideBuildIssueApi } from '@/lib/builds/issues.contract';
import { hideBody } from '@/lib/builds/issues-schema';
import { hideIssue, readIssueBuild, refusedResponse } from '@/lib/builds/issues.server';

/** POST /api/builds/$id/issues/$issueId/hide  the build's creator hides or unhides an issue. Body: { hidden }. */
export const route = apiRoute('/api/builds/$id/issues/$issueId/hide', {
  POST: implement(hideBuildIssueApi, { rateLimit: 'write', body: hideBody }, async ({ params, userId, body }) => {
    const build = await readIssueBuild(params.id, userId);
    if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
    const result = await hideIssue(build, params.issueId, userId, body.hidden);
    if (!result.ok) return refusedResponse(result);
    return { hidden: result.hidden };
  }),
});
