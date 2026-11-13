import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { isAiConfigured, streamTask } from '@/lib/ai/provider.server';
import { WIKI_WRITE, asData, systemFor } from '@/lib/ai/prompts';
import { isAppError } from '@/lib/errors/codes';
import { wikiAssistBody } from '@/lib/wiki/wiki-schema';

/**
 * POST /api/admin/wiki/assist — the wiki editor's DeepSeek writing assistant. Admin only.
 *
 * Takes an instruction plus the page as it stands and streams back the whole
 * page in Markdown: a new page when the body is empty, the edited page when it
 * is not. Nothing is saved here; the admin reads the result in the editor and
 * saves it through `PUT /api/admin/wiki/pages/$id`.
 *
 * The response is `text/event-stream` of `{"delta":"…"}` frames closed by
 * `[DONE]` (the shape `/api/ai/transform` streams), which is why this stays a
 * route file rather than a registered endpoint. A page is thousands of tokens,
 * so a blocking call would sit past the client's timeout before the first word.
 *
 * The instruction and the page are both framed as data (`asData`): an admin
 * pastes text from anywhere, and existing page content is whatever the last
 * editor left in it.
 */
export const Route = createFileRoute('/api/admin/wiki/assist')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'ai', body: wikiAssistBody },
        async ({ userId, body }) => {
          if (!isAiConfigured()) {
            return Response.json({ error: 'AI_UNAVAILABLE' }, { status: 503 });
          }

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              const send = (payload: unknown) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                } catch {
                  // The admin closed the editor mid-stream; the generator's
                  // `finally` still meters what was produced.
                }
              };
              try {
                for await (const delta of streamTask(
                  WIKI_WRITE.task,
                  systemFor(WIKI_WRITE),
                  asData(
                    JSON.stringify({
                      instruction: body.instruction,
                      title: body.title,
                      content: body.content,
                    }),
                  ),
                  { userId, promptId: WIKI_WRITE.id, promptVer: WIKI_WRITE.version },
                )) {
                  send({ delta });
                }
              } catch (err) {
                // The status line is gone, so a failure is an in-band frame.
                // The upstream message is never echoed.
                console.error('[api] POST /api/admin/wiki/assist stream failed:', err);
                send({ error: isAppError(err) ? err.code : 'AI_UNAVAILABLE' });
              } finally {
                try {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } catch {
                  /* already closed */
                }
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
      ),
    },
  },
});
