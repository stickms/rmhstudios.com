import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { assistantAskSchema } from '@/lib/assistant/assistant-schema';
import { askConciergeApi } from '@/lib/assistant/assistant.contract';
import { answerQuestion } from '@/lib/assistant/assistant.server';

/**
 * POST /api/assistant — the site-wide AI Concierge (§11).
 *
 * Read-only: answers questions about the platform and returns navigation links.
 * Per-day quota by tier is enforced inside `answerQuestion`; the IP rate limit
 * here is the coarse abuse guard on the (paid) model call.
 */

export const route = apiRoute('/api/assistant', {
  POST: implement(
    askConciergeApi,
    {
      rateLimit: {
        limit: 20,
        windowMs: 60_000,
        prefix: 'assistant',
        message: 'Slow down a moment',
      },
      body: assistantAskSchema,
      allowEmptyBody: true,
    },
    async ({ session, body }) => {
      const result = await answerQuestion({
        userId: session.user.id,
        question: body.question.trim(),
        history: body.history,
      });

      return Response.json(result);
    },
  ),
});
