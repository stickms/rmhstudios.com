import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { moderateSchema } from '@/lib/predictions/predictions-schema';
import { moderatePrediction, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/admin/predictions/$id/moderate — approve or deny a submission. */
export const Route = createFileRoute('/api/admin/predictions/$id/moderate')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' } },
        async ({ request, params, session }) => {
          try {
            const parsed = moderateSchema.safeParse(await request.json().catch(() => null));
            if (!parsed.success) {
              return Response.json({ error: 'Invalid input' }, { status: 400 });
            }
            const approve = parsed.data.action === 'approve';
            const market = await moderatePrediction({ predictionId: params.id, approve });
            await logAdminAction(
              session.user.id,
              approve ? 'prediction.approve' : 'prediction.deny',
              {
                targetType: 'prediction',
                targetId: params.id,
                detail: market.title,
              },
            );
            return Response.json({ ok: true, status: market.status });
          } catch (error) {
            if (error instanceof PredictionError) {
              return Response.json({ error: error.message }, { status: error.status });
            }
            console.error('Prediction moderate error:', error);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
