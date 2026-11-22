import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { voteBuildIssueApi } from '@/lib/builds/issues.contract';
import { voteBody } from '@/lib/builds/issues-schema';
import { readIssueBuild, refusedResponse, setVote } from '@/lib/builds/issues.server';

/** PUT /api/builds/$id/issues/$issueId/vote  "I see this too", once per member: { voted: true } adds, false takes back. */
export const route = apiRoute('/api/builds/$id/issues/$issueId/vote', {
  PUT: implement(
    voteBuildIssueApi,
    { rateLimit: { limit: 60, windowMs: 3_600_000, prefix: 'build-issue-vote' }, body: voteBody },
    async ({ params, userId, body }) => {
      const build = await readIssueBuild(params.id, userId);
      if (!build) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      const result = await setVote(build, params.issueId, userId, body.voted);
      if (!result.ok) return refusedResponse(result);
      return { voted: result.voted, voteCount: result.voteCount };
    },
  ),
});
