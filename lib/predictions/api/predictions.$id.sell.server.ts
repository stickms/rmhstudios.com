import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { sellPredictionApi } from '@/lib/predictions/predictions.contract';
import { sellSchema } from '@/lib/predictions/predictions-schema';
import { PredictionError, sellShares } from '@/lib/predictions/predictions.server';

/** POST /api/predictions/$id/sell — sell shares back to the market before it resolves. */
export const route = apiRoute('/api/predictions/$id/sell', {
  POST: implement(
    sellPredictionApi,
    {
      // The trade route's bucket: a buy and a sale draw from the same allowance.
      rateLimit: { limit: 300, windowMs: 60_000, prefix: 'prediction-trade', scope: 'user' },
      body: sellSchema,
      verboseValidationErrors: true,
    },
    async ({ userId, params, body }) => {
      try {
        return await sellShares({
          userId,
          predictionId: params.id,
          side: body.side,
          shares: body.shares,
          minProceeds: body.minProceeds,
          key: body.key,
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
