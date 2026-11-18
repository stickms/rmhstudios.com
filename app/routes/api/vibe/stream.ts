/**
 * POST /api/vibe/stream
 *
 * Streams RMHVibe generation as Server-Sent Events. Body: vibeStreamBodySchema.
 * Each SSE `data:` frame is a VibeStreamEvent (created | thinking | content | done | error).
 * Without `slug` this creates a page. With `slug`, the signed-in owner customizes
 * it in place; anyone else remixes it into a new page of their own. The page is persisted before the final `done` event is emitted.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertVibeAllowed } from '@/lib/ai/vibe-budget.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { generateVibeStream } from '@/lib/rmhvibe/vibe.server';
import { vibeStreamBodySchema } from '@/lib/rmhvibe/vibe-schema';
import { asVibeModel } from '@/lib/rmhvibe/vibe-types';

export const Route = createFileRoute('/api/vibe/stream')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'optional',
          rateLimit: { limit: 10, windowMs: 5 * 60_000, prefix: 'vibe' },
          body: vibeStreamBodySchema,
        },
        async ({ userId, body }) => {
          // A timed-out user cannot build or remix (anonymous builds have no account to time out).
          if (userId) {
            const restricted = await restrictionResponse(userId, 'vibe');
            if (restricted) return restricted;
          }
          // Spend gates, before any row is reserved or model called: the platform's daily
          // vibe cap (503 AI_UNAVAILABLE, scope vibe-busy) and a signed-in user's monthly vibe
          // ceiling (402 AI_BUDGET_EXCEEDED, scope vibe). defineHandler turns the AppError into the envelope.
          await assertVibeAllowed(userId);
          const { prompt, slug, fromVersionId, kind, selection } = body;
          const model = asVibeModel(body.model);

          const encoder = new TextEncoder();
          // `open` tracks whether the client is still connected. Generation is
          // deliberately NOT tied to the connection: we keep draining the generator
          // even after the client goes away (`open = false`) so the page is still
          // built and persisted in the background — the whole point of the reserved
          // "generating" row. We just stop pushing SSE frames once nobody's listening.
          let open = true;
          const stream = new ReadableStream({
            async start(controller) {
              const send = (data: unknown) => {
                if (!open) return;
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                  open = false; // controller closed/errored — client is gone
                }
              };
              try {
                for await (const event of generateVibeStream({
                  prompt,
                  slug,
                  fromVersionId,
                  model,
                  userId,
                  kind,
                  selection,
                })) {
                  send(event);
                }
              } catch {
                send({ type: 'error', message: 'Generation failed' });
              } finally {
                if (open) {
                  try {
                    controller.close();
                  } catch {
                    /* already closed */
                  }
                  open = false;
                }
              }
            },
            // Client disconnected (navigated away / tab closed). Stop emitting, but let
            // the in-flight generation above run to completion so the page is saved.
            cancel() {
              open = false;
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            },
          });
        },
      ),
    },
  },
});
