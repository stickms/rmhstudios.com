import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { tradePredictionApi } from '@/lib/predictions/predictions.contract';
import { tradeSchema } from '@/lib/predictions/predictions-schema';
import { placeTrade, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/predictions/$id/trade — buy YES/NO shares with coins. */
export const Route = createFileRoute('/api/predictions/$id/trade')({
  server: {
    handlers: {
      POST: implement(
        tradePredictionApi,
        {
          rateLimit: { limit: 300, windowMs: 60_000, prefix: 'prediction-trade', scope: 'user' },
          body: tradeSchema,
          verboseValidationErrors: true,
        },
        async ({ userId, params, body }) => {
          try {
            return await placeTrade({
              userId,
              predictionId: params.id,
              side: body.side,
              amount: body.amount,
            });
          } catch (error) {
            if (error instanceof PredictionError) {
              return Response.json({ error: error.message }, { status: error.status });
            }
            throw error;
          }
        },
      ),
    },
  },
});
