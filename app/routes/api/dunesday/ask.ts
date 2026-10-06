import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { dunesdayAskSchema } from '@/lib/dunesday/ask-schema';
import { answerDunesdayQuestion, isAITextConfigured } from '@/lib/dunesday/assistant.server';

/**
 * POST /api/dunesday/ask — the marathon planner's chat assistant.
 *
 * `auth: 'optional'`: the planner itself needs no account (the plan lives in
 * the browser), and gating only the chat behind a sign-in would make the page
 * feel half-locked. The cost story is therefore carried entirely by the `'ai'`
 * rate-limit policy — the tightest bucket the site has — keyed per IP.
 *
 * Error shape follows `/api/pf2ecal/ask`: 503 when no key is configured, 502
 * when the upstream fails, both with a sentence the chat window can show.
 */
export const Route = createFileRoute('/api/dunesday/ask')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', rateLimit: 'ai', body: dunesdayAskSchema },
        async ({ body }) => {
          if (!isAITextConfigured()) {
            return Response.json(
              { error: 'The assistant is not configured right now.' },
              { status: 503 },
            );
          }

          let answer: string;
          try {
            answer = await answerDunesdayQuestion(body);
          } catch (cause) {
            console.error('[dunesday] assistant upstream failed:', cause);
            return Response.json(
              { error: 'The assistant is unreachable right now. Try again in a minute.' },
              { status: 502 },
            );
          }

          if (!answer) {
            return Response.json(
              { error: 'The assistant did not have an answer. Try rephrasing.' },
              { status: 502 },
            );
          }
          return Response.json({ answer });
        },
      ),
    },
  },
});
