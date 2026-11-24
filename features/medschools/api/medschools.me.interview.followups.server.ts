import { isAiConfigured } from '@/lib/ai/provider.server';
import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { postMedInterviewFollowupsApi } from '@features/medschools/medschools.contract';
import { badInput } from './me-http.server';
import { generateFollowups, schoolExampleQuestions } from './qa/followups.server';
import { followupsBody } from './qa-schemas';

/**
 * `POST /api/medschools/me/interview/followups`: two or three follow-up questions an interviewer might ask, for one
 * question and the member's optional notes. Signed in and personal, so it declares no `cache`. One generation takes one
 * of the member's daily Q&A questions and runs inside the Q&A share of the monthly budget (`generateFollowups`); nothing
 * about the request or the reply is stored. Rate-limited like `ask`.
 */
const FOLLOWUPS_LIMIT = {
  policy: 'ai',
  limit: 6,
  windowMs: 60_000,
  prefix: 'medschools-followups',
  scope: 'user',
} as const;

export const route = apiRoute('/api/medschools/me/interview/followups', {
  POST: implement(
    postMedInterviewFollowupsApi,
    { rateLimit: FOLLOWUPS_LIMIT, rateLimitExemptAdmin: true, body: followupsBody },
    async ({ userId, isAdmin, body, request }) => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
      if (user?.bannedUntil && user.bannedUntil > new Date()) {
        return Response.json({ error: 'suspended' }, { status: 403 });
      }
      if (!isAiConfigured()) return Response.json({ ...refusalBody('AI_UNAVAILABLE') }, { status: 503 });
      // An unknown or inactive school is refused before anything is reserved.
      let stored: string[] = [];
      if (body.slug) {
        const found = await schoolExampleQuestions(body.slug);
        if (found === null) return badInput();
        stored = found;
      }
      return generateFollowups({
        userId,
        isAdmin,
        question: body.question,
        notes: body.notes,
        stored,
        think: body.think === true,
        signal: request.signal,
      });
    },
  ),
});
