import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { answerSchema } from '@/lib/delight/schema';
import { submitAnswer } from '@/lib/delight/hunt.server';

/** POST /api/hunt/answer { answer } — checked server-side against the member's current clue. */
export const route = apiRoute('/api/hunt/answer', {
  POST: defineHandler(
    {
      rateLimit: { limit: 15, windowMs: 60_000, prefix: 'hunt-answer', scope: 'user' },
      body: answerSchema,
    },
    async ({ userId, body }) => {
      const r = await submitAnswer(userId, body.answer);
      if (!r) return Response.json({ error: 'No hunt in progress' }, { status: 404 });
      return Response.json(r);
    },
  ),
});
