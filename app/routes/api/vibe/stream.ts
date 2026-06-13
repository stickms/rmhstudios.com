/**
 * POST /api/vibe/stream
 *
 * Streams RMHVibe generation as Server-Sent Events. Body: { prompt, slug? }.
 * Each SSE `data:` frame is a VibeStreamEvent (thinking | content | done | error).
 * When `slug` is present, this customizes the existing page; otherwise it creates
 * a new one. The page is persisted before the final `done` event is emitted.
 */

import { createFileRoute } from '@tanstack/react-router';
import { generateVibeStream } from '@/lib/rmhvibe/vibe.server';
import { asVibeModel } from '@/lib/rmhvibe/vibe-types';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/vibe/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Generation drives an expensive LLM call (and esbuild bundling), so cap
        // how often a single client can kick one off. Covers both new pages and
        // "customize" follow-ups, which share this endpoint.
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 10,
          windowMs: 5 * 60_000,
          prefix: 'vibe',
        });
        if (!allowed) {
          return new Response('Too many requests. Please slow down and try again shortly.', {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
          });
        }

        const body = (await request.json().catch(() => ({}))) as {
          prompt?: unknown;
          slug?: unknown;
          fromVersionId?: unknown;
          model?: unknown;
        };
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const slug = typeof body.slug === 'string' ? body.slug : undefined;
        const fromVersionId =
          typeof body.fromVersionId === 'string' ? body.fromVersionId : undefined;
        const model = asVibeModel(body.model);

        if (!prompt) {
          return new Response('Missing prompt', { status: 400 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (data: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            try {
              for await (const event of generateVibeStream({ prompt, slug, fromVersionId, model })) {
                send(event);
              }
            } catch {
              send({ type: 'error', message: 'Generation failed' });
            } finally {
              controller.close();
            }
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
    },
  },
});
