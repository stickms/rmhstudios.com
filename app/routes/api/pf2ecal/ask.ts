import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { answerCalendarQuestion, isAITextConfigured } from '@/lib/pf2ecal/assistant.server';

const askSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(12)
    .default([]),
});

/**
 * POST /api/pf2ecal/ask — ask the assistant about the schedule.
 *
 * `auth: 'optional'`: asking a question reads the same board anyone with the
 * link can already read, so requiring an account to ask about it would gate
 * nothing that is not already open. Signed-in callers get one extra thing —
 * their name reaches the prompt, so "am I down for next week" can be resolved
 * against the roster.
 *
 * The rate limit therefore carries the whole cost story on its own, and it is
 * keyed per IP (the default scope) rather than per user, because for an
 * anonymous caller there is no user to key on. This is the one endpoint on the
 * page that spends money at an upstream provider, so it stays on the `'ai'`
 * policy — the tightest bucket the site has — rather than `'read'`.
 *
 * A missing `DEEPSEEK_API_KEY` returns 503 rather than letting the SDK fail with
 * a 401 that surfaces as a generic 500 — the client renders that as "the
 * assistant is off right now", which is true and actionable, where "something
 * went wrong" is neither.
 */
export const Route = createFileRoute('/api/pf2ecal/ask')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', rateLimit: 'ai', body: askSchema },
        async ({ user, body }) => {
          if (!isAITextConfigured()) {
            return Response.json(
              { error: 'The assistant is not configured right now.' },
              { status: 503 },
            );
          }

          // The upstream call is caught here rather than left to
          // `defineHandler`'s catch-all. Anything that throws there becomes a
          // bare `{ error: 'Internal Server Error' }` 500 — correct, because it
          // must never leak a provider message to the caller, but it tells the
          // user their own request was broken when in fact DeepSeek was down,
          // rate-limiting us, or unreachable. 502 with a sentence they can act
          // on is the honest answer, and the detail still only reaches the log.
          let answer: string;
          try {
            answer = await answerCalendarQuestion(body.question, body.history, user?.name ?? null);
          } catch (cause) {
            console.error('[pf2ecal] assistant upstream failed:', cause);
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
