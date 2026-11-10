import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { reviewRedemptionApi } from '@/lib/admin/admin-tools.contract';
import { reviewRedemptionSchema } from '@/lib/creator/redemption-schema';
import { reviewRedemption, RedemptionError } from '@/lib/creator/earnings.server';

export const Route = createFileRoute('/api/admin/redemptions/$id')({
  server: {
    handlers: {
      POST: implement(
        reviewRedemptionApi,
        {
          auth: 'admin',
          rateLimit: { policy: 'write', scope: 'user' },
          body: reviewRedemptionSchema,
          allowEmptyBody: true,
          invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
        },
        async ({ params, session, body }) => {
          try {
            const result = await reviewRedemption({
              id: params.id,
              action: body.action,
              adminId: session.user.id,
              note: body.note,
              externalRef: body.externalRef,
            });
            return { ok: true as const, ...result };
          } catch (error) {
            if (error instanceof RedemptionError) {
              return Response.json({ error: error.message }, { status: error.status });
            }
            throw error;
          }
        },
      ),
    },
  },
});
