import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { tradeSchema } from '@/lib/predictions/predictions-schema';
import { placeTrade, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/predictions/$id/trade — buy YES/NO shares with coins. */
export const Route = createFileRoute('/api/predictions/$id/trade')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(`${userId}:${ip}`, {
            limit: 20,
            windowMs: 60_000,
            prefix: 'prediction-trade',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const parsed = tradeSchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          const result = await placeTrade({
            userId,
            predictionId: params.id,
            side: parsed.data.side,
            amount: parsed.data.amount,
          });
          return Response.json(result);
        } catch (error) {
          if (error instanceof PredictionError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Prediction trade error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
