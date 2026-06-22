import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isAITextConfigured, suggestMessageCompletion } from '@/lib/ai/text.server';

/**
 * Inline message autocomplete (Smart Compose) for chat composers — DMs, group
 * chats, anywhere a draft + recent context is available. Fail-soft by design:
 * any problem (unauthed beyond the gate, AI off, rate limited, bad input,
 * upstream error) returns `{ suggestion: "" }` so the composer simply shows no
 * ghost text rather than surfacing an error.
 */
export const Route = createFileRoute('/api/ai/message-suggest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          if (!isAITextConfigured()) return Response.json({ suggestion: '' });

          // Generous limit — this fires while typing — but still bounded per IP.
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 60,
            windowMs: 60_000,
            prefix: 'ai-message-suggest',
          });
          if (!allowed) return Response.json({ suggestion: '' });

          const body = await request.json().catch(() => ({}));
          const draft = typeof body?.draft === 'string' ? body.draft.slice(0, 1000) : '';
          if (draft.trim().length < 2) return Response.json({ suggestion: '' });

          const context = Array.isArray(body?.context)
            ? body.context
                .filter(
                  (m: unknown): m is { author: string; content: string } =>
                    !!m &&
                    typeof (m as { author?: unknown }).author === 'string' &&
                    typeof (m as { content?: unknown }).content === 'string'
                )
                .slice(-20)
                .map((m: { author: string; content: string }) => ({
                  author: m.author.slice(0, 40),
                  content: m.content.slice(0, 500),
                }))
            : [];

          const suggestion = await suggestMessageCompletion(context, draft);
          return Response.json({ suggestion });
        } catch (error) {
          console.error('message-suggest error:', error);
          return Response.json({ suggestion: '' });
        }
      },
    },
  },
});
