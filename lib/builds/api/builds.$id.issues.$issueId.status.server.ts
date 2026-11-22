import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setBuildIssueStatusApi } from '@/lib/builds/issues.contract';
import { statusBody } from '@/lib/builds/issues-schema';
import { readIssueBuild, refusedResponse, setIssueStatus } from '@/lib/builds/issues.server';

/**
 * POST /api/builds/$id/issues/$issueId/status  the build's creator sets the status. The creator check is inside
 * `setIssueStatus`; a status that changed since `expected` answers 409 and changes nothing.
 */
export const route = apiRoute('/api/builds/$id/issues/$issueId/status', {
  POST: implement(
    setBuildIssueStatusApi,
    { rateLimit: 'write', body: statusBody },
    async ({ params, userId, body }) => {
      const build = await readIssueBuild(params.id, userId);
      if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      const result = await setIssueStatus(build, params.issueId, userId, body.expected, {
        status: body.status,
        fixedInId: body.fixedInId,
        duplicateOfId: body.duplicateOfId,
        reason: body.reason,
      });
      if (!result.ok) return refusedResponse(result);
      return { issue: result.issue };
    },
  ),
});
