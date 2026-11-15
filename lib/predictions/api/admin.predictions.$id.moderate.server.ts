import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminModeratePredictionApi } from '@/lib/predictions/predictions.contract';
import { logAdminAction } from '@/lib/admin-audit.server';
import { moderateSchema } from '@/lib/predictions/predictions-schema';
import { moderatePrediction, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/admin/predictions/$id/moderate — approve or deny a submission. */
export const route = apiRoute('/api/admin/predictions/$id/moderate', {
  POST: implement(
    adminModeratePredictionApi,
    {
      auth: 'admin',
      rateLimit: { policy: 'write', scope: 'user' },
      body: moderateSchema,
      invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
    },
    async ({ params, body, userId }) => {
      try {
        const approve = body.action === 'approve';
        const market = await moderatePrediction({ predictionId: params.id, approve });
        await logAdminAction(userId, approve ? 'prediction.approve' : 'prediction.deny', {
          targetType: 'prediction',
          targetId: params.id,
          detail: market.title,
        });
        return { ok: true as const, status: market.status };
      } catch (error) {
        if (error instanceof PredictionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        console.error('Prediction moderate error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
