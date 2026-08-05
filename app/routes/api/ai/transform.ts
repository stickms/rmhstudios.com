import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { transformText, isAITextConfigured, type ComposeAction } from '@/lib/ai/text.server';
import { streamTask } from '@/lib/ai/provider.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { SAFETY_FRAME, asData } from '@/lib/ai/prompts';
import { isAppError } from '@/lib/errors/codes';

/**
 * POST /api/ai/transform — compose-assist rewrite of a draft.
 *
 * Two response shapes from one endpoint:
 *
 *  - **default** (`stream` absent/false) — `{ text }`, byte-identical to what
 *    this route has always returned. Existing clients are untouched.
 *  - **`stream: true`** — `text/event-stream` of `{"delta":"…"}` frames closed
 *    by `[DONE]` (A4).
 *
 * The streaming half exists because `stream: false` was hardcoded through
 * `text.server.ts`, so a rewrite blocked for the entire completion — two to five
 * seconds of spinner on a caret the user is watching. The tokens arrive at the
 * same rate either way; only the point at which the user can start reading them
 * moves. That is the whole feature.
 *
 * Budget (A2) is asserted on **both** paths and before either model call: the
 * point of a ceiling is to not spend the money, and a streamed call spends
 * exactly as much as a blocking one.
 */

const schema = z.object({
  text: z.string().min(1).max(1000),
  action: z.enum(['improve', 'expand', 'shorten', 'casual', 'formal', 'fix']),
  /**
   * Opt in to SSE. Defaulting to `false` rather than sniffing `Accept:` keeps
   * the choice explicit — a client that cannot parse an event stream must never
   * get one because of a header it did not think about.
   */
  stream: z.boolean().optional(),
});

/**
 * Per-action instruction for the **streaming** path.
 *
 * Deliberately a second copy of the map inside `lib/ai/text.server.ts`, which
 * does not export it. Two wordings for one feature is a real smell, and the fix
 * is a `COMPOSE_TRANSFORM` entry in `lib/ai/prompts/` that both paths read —
 * that registry is owned elsewhere, so this stays a documented duplicate rather
 * than a silent divergence. **Keep the two in sync until then.**
 */
const STREAM_ACTIONS: Record<ComposeAction, string> = {
  improve:
    'Rewrite the text to be clearer and more engaging while keeping the meaning and roughly the same length.',
  expand:
    'Expand the text with a bit more detail, keeping the same voice. Stay under 280 characters.',
  shorten:
    'Make the text more concise while keeping the key point. Stay well under 280 characters.',
  casual: 'Rewrite the text in a casual, friendly tone.',
  formal: 'Rewrite the text in a more polished, professional tone.',
  fix: 'Fix spelling, grammar, and punctuation only. Do not change the meaning or tone.',
};

/** Ledger identity for the streamed prompt, so a quality change is queryable. */
const STREAM_PROMPT_ID = 'compose-transform-stream';
const STREAM_PROMPT_VER = 1;

/** Matches `transformText`'s ceilings, so streamed and blocking output compare. */
const STREAM_MAX_TOKENS = 300;
const STREAM_TEMPERATURE = 0.7;

function streamSystem(action: ComposeAction): string {
  return [
    'You are a writing assistant for a social platform.',
    STREAM_ACTIONS[action],
    'Output ONLY the rewritten text — no quotes, no preamble, no explanation.',
    '',
    SAFETY_FRAME,
  ].join('\n');
}

export const Route = createFileRoute('/api/ai/transform')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'none', body: schema, allowEmptyBody: true },
        async ({ request, body }) => {
          if (!isAITextConfigured())
            return Response.json({ error: 'AI is unavailable' }, { status: 503 });
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          // Hand-rolled on purpose — this route's 20/min bucket predates
          // `rateLimit: 'ai'` and migrating it is tracked separately.
          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 20,
            windowMs: 60_000,
            prefix: 'ai-transform',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const userId = session.user.id;

          // Everything that can refuse the request must refuse it *here*, while
          // a status code is still negotiable: once the stream's 200 + headers
          // are flushed there is no way to turn the response into a 402.
          await assertAiBudget(userId);

          if (!body.stream) {
            const result = await transformText(body.text, body.action);
            if (!result) return Response.json({ error: 'No result' }, { status: 502 });
            return Response.json({ text: result });
          }

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              const send = (payload: unknown) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                } catch {
                  // Client hung up mid-frame; the generator's `finally` still
                  // meters what was produced.
                }
              };

              try {
                for await (const delta of streamTask(
                  'compose-assist',
                  streamSystem(body.action),
                  // Framed as data even though this prompt only rewrites: a
                  // draft post is public text, and "rewrite this" is exactly the
                  // shape of request an injected instruction rides in on.
                  asData(body.text),
                  {
                    userId,
                    promptId: STREAM_PROMPT_ID,
                    promptVer: STREAM_PROMPT_VER,
                    maxTokens: STREAM_MAX_TOKENS,
                    temperature: STREAM_TEMPERATURE,
                  },
                )) {
                  send({ delta });
                }
              } catch (err) {
                // The status line is long gone, so a failure is an in-band
                // frame. Never echo the upstream message — it can carry request
                // ids and model configuration.
                console.error('[api] POST /api/ai/transform stream failed:', err);
                send({ error: isAppError(err) ? err.code : 'AI_UNAVAILABLE' });
              } finally {
                // `[DONE]` is emitted on every exit path, including the error
                // one, so a client's read loop always terminates rather than
                // hanging until its own timeout.
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
              // `no-transform` matters as much as `no-cache`: a proxy that
              // gzips the body buffers it, which is the one thing streaming
              // cannot survive.
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              // Apache/nginx in front of this would otherwise hold the response
              // until it looked complete.
              'X-Accel-Buffering': 'no',
            },
          });
        },
      ),
    },
  },
});
