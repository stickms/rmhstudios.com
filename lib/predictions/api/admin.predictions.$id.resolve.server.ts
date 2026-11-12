import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminResolvePredictionApi } from '@/lib/predictions/predictions.contract';
import { logAdminAction } from '@/lib/admin-audit.server';
import { resolveSchema } from '@/lib/predictions/predictions-schema';
import { resolvePrediction, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/admin/predictions/$id/resolve — settle a market to YES or NO. */
export const route = apiRoute('/api/admin/predictions/$id/resolve', {
  POST: implement(
    adminResolvePredictionApi,
    {
      auth: 'admin',
      rateLimit: { policy: 'write', scope: 'user' },
      body: resolveSchema,
      invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
    },
    async ({ params, body, userId }) => {
      try {
        const result = await resolvePrediction({
          predictionId: params.id,
          outcome: body.outcome,
        });
        await logAdminAction(userId, 'prediction.resolve', {
          targetType: 'prediction',
          targetId: params.id,
          detail: `${body.outcome} (paid ${result.payouts} coins)`,
        });
        return { ok: true as const, ...result };
      } catch (error) {
        if (error instanceof PredictionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        console.error('Prediction resolve error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
