import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { transformText, isAITextConfigured } from '@/lib/ai/text.server';

/** POST /api/ai/transform — compose-assist rewrite of a draft. */
const schema = z.object({
  text: z.string().min(1).max(1000),
  action: z.enum(['improve', 'expand', 'shorten', 'casual', 'formal', 'fix']),
});

export const Route = createFileRoute('/api/ai/transform')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAITextConfigured()) return Response.json({ error: 'AI is unavailable' }, { status: 503 });
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'ai-transform' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await transformText(parsed.data.text, parsed.data.action);
          if (!result) return Response.json({ error: 'No result' }, { status: 502 });
          return Response.json({ text: result });
        } catch (error) {
          console.error('AI transform error:', error);
          return Response.json({ error: 'Could not transform text' }, { status: 500 });
        }
      },
    },
  },
});
