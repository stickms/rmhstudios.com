import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { editBuildIssueApi } from '@/lib/builds/issues.contract';
import { editIssueBody } from '@/lib/builds/issues-schema';
import { editIssue, readIssueBuild, refusedResponse } from '@/lib/builds/issues.server';

/** PATCH /api/builds/$id/issues/$issueId  the reporter fixes their report while it is open. */
export const route = apiRoute('/api/builds/$id/issues/$issueId', {
  PATCH: implement(
    editBuildIssueApi,
    { rateLimit: { limit: 30, windowMs: 3_600_000, prefix: 'build-issue-edit' }, body: editIssueBody },
    async ({ params, userId, body }) => {
      const build = await readIssueBuild(params.id, userId);
      if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      const result = await editIssue(build, params.issueId, userId, body);
      if (!result.ok) return refusedResponse(result);
      return { issue: result.issue };
    },
  ),
});
