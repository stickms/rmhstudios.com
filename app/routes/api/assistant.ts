import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { answerQuestion } from '@/lib/assistant/assistant.server';

/**
 * POST /api/assistant — the site-wide AI Concierge (§11).
 *
 * Read-only: answers questions about the platform and returns navigation links.
 * Per-day quota by tier is enforced inside `answerQuestion`; the IP rate limit
 * here is the coarse abuse guard on the (paid) model call.
 */

const schema = z.object({
  question: z.string().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(20)
    .optional(),
});

export const Route = createFileRoute('/api/assistant')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'assistant',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Slow down a moment' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await answerQuestion({
            userId: session.user.id,
            question: parsed.data.question.trim(),
            history: parsed.data.history,
          });

          return Response.json(result);
        } catch (error) {
          console.error('assistant error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
