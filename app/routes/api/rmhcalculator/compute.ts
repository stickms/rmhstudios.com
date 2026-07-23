/**
 * POST /api/rmhcalculator/compute — scientific evaluation via DeepSeek.
 *
 * Auth → per-user rate limit (ai) → zod validate → stream. The response is
 * Server-Sent Events: `{type:'thinking',text}` reasoning deltas, then a terminal
 * `{type:'result',data}` (the parsed answer) and `{type:'done'}`, or
 * `{type:'error',message}`. All arithmetic is done by the model — see
 * lib/rmhcalculator/calc.server.ts.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { computeRequestSchema } from '@/lib/rmhcalculator/types';
import {
  CalcEngineError,
  isCalculatorConfigured,
  streamCompute,
} from '@/lib/rmhcalculator/calc.server';

export const Route = createFileRoute('/api/rmhcalculator/compute')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isCalculatorConfigured())
            return Response.json({ error: 'The calculator is unavailable right now.' }, { status: 503 });

          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const limited = withRateLimit(request, 'ai', { scope: session.user.id, prefix: 'rmhcalc' });
          if (limited) return limited;

          const body = await request.json().catch(() => ({}));
          const parsed = computeRequestSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              const send = (data: unknown) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              try {
                const gen = streamCompute(parsed.data);
                let step = await gen.next();
                while (!step.done) {
                  send({ type: 'thinking', text: step.value.text });
                  step = await gen.next();
                }
                send({ type: 'result', data: step.value });
                send({ type: 'done' });
              } catch (err) {
                const message =
                  err instanceof CalcEngineError ? err.message : 'The calculation failed. Please try again.';
                send({ type: 'error', message });
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
        } catch (error) {
          console.error('rmhcalculator compute error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
