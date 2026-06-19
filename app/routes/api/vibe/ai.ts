/**
 * POST /api/vibe/ai — AI proxy for generated vibe pages.
 *
 * Generated pages call this (via the injected `window.RMHVibeAI` helper) to use a
 * real LLM without ever seeing an API key — the server forwards to DeepSeek with
 * the server-only DEEPSEEK_API_KEY. See lib/rmhvibe/vibe-ai.server.ts.
 *
 * Body: { messages: [{role, content}], system?: string, stream?: boolean }.
 *  - stream=false (default): responds `{ reply: string }`.
 *  - stream=true: responds Server-Sent Events — `data: {type:'delta',text}` per
 *    chunk, then `data: {type:'done'}` (or `{type:'error',message}`).
 *
 * The page runs in a sandboxed (opaque-origin) iframe, so requests arrive
 * cross-origin with `Origin: null`. The response carries no secrets and no
 * credentials, so we allow any origin (`*`) and answer the CORS preflight. Abuse
 * is bounded by the per-IP rate limit here plus the hard caps in the server lib.
 */

import { createFileRoute } from '@tanstack/react-router';
import {
  parseChatRequest,
  vibeChat,
  vibeChatStream,
  VibeAIError,
} from '@/lib/rmhvibe/vibe-ai.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export const Route = createFileRoute('/api/vibe/ai')({
  server: {
    handlers: {
      // CORS preflight for the cross-origin POST from the sandboxed iframe.
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        // Public-facing paid API: cap how often any one client can call it.
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 30,
          windowMs: 60_000,
          prefix: 'vibe-ai',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests. Please slow down.' },
            { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': String(retryAfter) } },
          );
        }

        let parsed;
        try {
          const body = await request.json().catch(() => null);
          parsed = parseChatRequest(body);
        } catch (err) {
          const status = err instanceof VibeAIError ? err.status : 400;
          const message = err instanceof Error ? err.message : 'Bad request';
          return Response.json({ error: message }, { status, headers: CORS_HEADERS });
        }

        if (!parsed.stream) {
          try {
            const reply = await vibeChat(parsed.messages);
            return Response.json({ reply }, { headers: CORS_HEADERS });
          } catch {
            return Response.json(
              { error: 'The AI model failed to respond. Try again.' },
              { status: 502, headers: CORS_HEADERS },
            );
          }
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (data: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            try {
              for await (const text of vibeChatStream(parsed.messages)) {
                send({ type: 'delta', text });
              }
              send({ type: 'done' });
            } catch {
              send({ type: 'error', message: 'The AI model failed to respond.' });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            ...CORS_HEADERS,
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
