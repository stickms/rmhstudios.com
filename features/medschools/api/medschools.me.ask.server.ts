import { isAiConfigured } from '@/lib/ai/provider.server';
import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { askMedQuestionApi, getMedAskStatusApi } from '@features/medschools/medschools.contract';
import { READ_LIMIT } from './me-http.server';
import { answerQuestion } from './qa/answer.server';
import { dailyStatus } from './qa/budget.server';
import { askBody } from './qa-schemas';

/**
 * `/api/medschools/me/ask`: the member-facing Q&A (phase 6). Signed in, personal, and declares no `cache` of any kind:
 * an answer is for the one member who asked, and neither the question nor the answer is stored anywhere (the only trace
 * is the `AiUsage` row the provider writes). `POST` runs the daily cap, the Q&A share of the monthly budget and the
 * member's own allowance and the atomic daily-count and in-flight reservation inside `answerQuestion`, all before any model call; `GET` is the page's status line and calls
 * no model.
 */

/** Six questions a minute per member, on top of the daily cap and the one-in-flight rule. */
const ASK_LIMIT = { policy: 'ai', limit: 6, windowMs: 60_000, prefix: 'medschools-ask', scope: 'user' } as const;

export const route = apiRoute('/api/medschools/me/ask', {
  GET: implement(getMedAskStatusApi, { rateLimit: READ_LIMIT }, async ({ userId }) => ({
    configured: isAiConfigured(),
    ...(await dailyStatus(userId)),
  })),
  POST: implement(askMedQuestionApi, { rateLimit: ASK_LIMIT, body: askBody }, async ({ userId, body, request }) => {
    // A suspended account is refused, as it is for the wiki's "Edit with AI".
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
    if (user?.bannedUntil && user.bannedUntil > new Date()) {
      return Response.json({ error: 'suspended' }, { status: 403 });
    }
    // No key, no spend: refuse before any ledger read or budget check.
    if (!isAiConfigured()) return Response.json({ ...refusalBody('AI_UNAVAILABLE') }, { status: 503 });
    return answerQuestion({ userId, question: body.question, slug: body.slug, signal: request.signal });
  }),
});
