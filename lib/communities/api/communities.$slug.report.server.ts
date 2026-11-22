import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireReadable } from '@/lib/communities/guard.server';
import { reportToModsApi } from '@/lib/communities/rules.contract';
import { reportToModsBody } from '@/lib/communities/rules-schema';
import { RULE_REPORTS_PER_HOUR } from '@/lib/communities/rules';
import { RulesError, reportPostToMods } from '@/lib/communities/rules.server';

/**
 * POST /api/communities/$slug/report — a member reports a post to this community's
 * moderators for breaking one of its rules. Site-level reasons never come here:
 * they go to /api/moderation/report. A private community needs membership (a
 * non-member gets its usual 404). Reporters are counted, never named, in the queue.
 */
export const route = apiRoute('/api/communities/$slug/report', {
  POST: implement(
    reportToModsApi,
    {
      rateLimit: {
        limit: RULE_REPORTS_PER_HOUR,
        windowMs: 60 * 60_000,
        prefix: 'community-rule-report',
        message: 'Too many reports. Please try again later.',
      },
      body: reportToModsBody,
      verboseValidationErrors: true,
    },
    async ({ params, userId, body }) => {
      const guard = await requireReadable(params.slug, userId);
      if (!guard.ok) return guard.response;
      try {
        const { alreadyReported } = await reportPostToMods({
          communityId: guard.value.id,
          userId,
          postId: body.postId,
          ruleId: body.ruleId,
        });
        return {
          success: true as const,
          alreadyReported,
        };
      } catch (e) {
        if (e instanceof RulesError) {
          return Response.json(
            {
              error: e.message,
            },
            {
              status: e.status,
            },
          );
        }
        throw e;
      }
    },
  ),
});
