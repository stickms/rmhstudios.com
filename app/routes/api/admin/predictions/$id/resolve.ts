import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin-audit.server';
import { resolveSchema } from '@/lib/predictions/predictions-schema';
import { resolvePrediction, PredictionError } from '@/lib/predictions/predictions.server';

/** POST /api/admin/predictions/$id/resolve — settle a market to YES or NO. */
export const Route = createFileRoute('/api/admin/predictions/$id/resolve')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        try {
          const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          const result = await resolvePrediction({
            predictionId: params.id,
            outcome: parsed.data.outcome,
          });
          await logAdminAction(session.user.id, 'prediction.resolve', {
            targetType: 'prediction',
            targetId: params.id,
            detail: `${parsed.data.outcome} (paid ${result.payouts} coins)`,
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          if (error instanceof PredictionError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Prediction resolve error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
