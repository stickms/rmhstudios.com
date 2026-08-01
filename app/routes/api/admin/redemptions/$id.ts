import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { reviewRedemptionSchema } from '@/lib/creator/redemption-schema';
import { reviewRedemption, RedemptionError } from '@/lib/creator/earnings.server';

export const Route = createFileRoute('/api/admin/redemptions/$id')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'optional' }, async ({ request, params, session }) => {
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        try {
          const parsed = reviewRedemptionSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await reviewRedemption({
            id: params.id,
            action: parsed.data.action,
            adminId: session.user.id,
            note: parsed.data.note,
            externalRef: parsed.data.externalRef,
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          if (error instanceof RedemptionError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Admin redemption review error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      }),
    },
  },
});
