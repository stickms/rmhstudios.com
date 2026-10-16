import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { fortuneSubmitSchema } from '@/lib/delight/schema';
import { submitFortune } from '@/lib/delight/fortune.server';

/** POST /api/fortune { text } — submit a one-liner for moderation (3 pending at a time). */
export const Route = createFileRoute('/api/fortune/')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 5, windowMs: 3_600_000, prefix: 'fortune-submit', scope: 'user' },
          body: fortuneSubmitSchema,
        },
        async ({ userId, body }) => {
          const r = await submitFortune(userId, body.text);
          if (r === 'too-many') {
            return Response.json(
              { error: 'You already have 3 waiting for review' },
              { status: 429 },
            );
          }
          return Response.json({ ok: true }, { status: 201 });
        },
      ),
    },
  },
});
