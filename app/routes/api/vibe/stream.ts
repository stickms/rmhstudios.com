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

export const Route = createFileRoute('/api/vibe/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          prompt?: unknown;
          slug?: unknown;
        };
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const slug = typeof body.slug === 'string' ? body.slug : undefined;

        if (!prompt) {
          return new Response('Missing prompt', { status: 400 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (data: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            try {
              for await (const event of generateVibeStream({ prompt, slug })) {
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
