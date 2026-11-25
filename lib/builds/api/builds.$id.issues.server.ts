import { refusalBody } from '@/lib/errors/codes';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createBuildIssueApi, listBuildIssuesApi } from '@/lib/builds/issues.contract';
import { createIssueBody, listIssuesQuery } from '@/lib/builds/issues-schema';
import { ISSUES_PAGE } from '@/lib/builds/issues';
import { createIssue, listIssues, readIssueBuild, refusedResponse } from '@/lib/builds/issues.server';

/**
 * GET  /api/builds/$id/issues  one page of a build's issues, with the counts for the filter tabs.
 * POST /api/builds/$id/issues  report an issue (at most 10 per build per day, refused for blocks and bans).
 * A private build answers 404 to everyone but its creator, before anything else is read.
 */
export const route = apiRoute('/api/builds/$id/issues', {
  GET: implement(
    listBuildIssuesApi,
    { auth: 'optional', rateLimit: 'read', query: listIssuesQuery },
    async ({ params, userId, query }) => {
      const build = await readIssueBuild(params.id, userId);
      if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      return listIssues({
        build,
        viewerId: userId,
        status: query.status ?? 'all',
        sort: query.sort ?? 'newest',
        cursor: query.cursor,
        limit: query.limit ?? ISSUES_PAGE,
      });
    },
  ),
  POST: implement(
    createBuildIssueApi,
    { rateLimit: { limit: 30, windowMs: 3_600_000, prefix: 'build-issue-create' }, body: createIssueBody },
    async ({ params, userId, body }) => {
      const restricted = await restrictionResponse(userId, 'comment');
      if (restricted) return restricted;
      const build = await readIssueBuild(params.id, userId);
      if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      const result = await createIssue(build, userId, body);
      if (!result.ok) return refusedResponse(result);
      return { issue: result.issue };
    },
  ),
});
