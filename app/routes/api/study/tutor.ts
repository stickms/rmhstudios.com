import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { tutorAnswer, isTutorConfigured } from '@/lib/rmhstudy/tutor.server';

const schema = z.object({ question: z.string().min(1).max(1000) });

/** POST /api/study/tutor — ask the AI study tutor a question. */
export const Route = createFileRoute('/api/study/tutor')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          if (!isTutorConfigured()) return Response.json({ error: 'AI tutor is not configured' }, { status: 503 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'study-tutor' });
          if (!allowed) return Response.json({ error: 'Slow down a moment' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid question' }, { status: 400 });

          const answer = await tutorAnswer(parsed.data.question.trim());
          return Response.json({ answer });
        } catch (error) {
          console.error('Study tutor error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
