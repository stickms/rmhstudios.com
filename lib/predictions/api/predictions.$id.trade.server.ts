import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { tradePredictionApi } from '@/lib/predictions/predictions.contract';
import { tradeSchema } from '@/lib/predictions/predictions-schema';
import { placeTrade, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/predictions/$id/trade — buy YES/NO shares with coins. */
export const route = apiRoute('/api/predictions/$id/trade', {
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
          minShares: body.minShares,
        });
      } catch (error) {
        if (error instanceof PredictionError) {
          if (error.refusal) return Response.json({ ...refusalBody(error.refusal) }, { status: error.status });
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
