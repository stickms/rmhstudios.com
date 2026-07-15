import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin-audit.server';
import { adjudicateWagerSchema } from '@/lib/wager/wager-schema';
import { adjudicateWager, WagerError } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/api/admin/wager/$id/resolve')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        try {
          const parsed = adjudicateWagerSchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await adjudicateWager({
            matchId: params.id,
            winnerId: parsed.data.winnerId,
            adminId: session.user.id,
            note: parsed.data.note,
          });
          await logAdminAction(session.user.id, 'wager.adjudicate', {
            targetType: 'wager',
            targetId: params.id,
            detail: parsed.data.winnerId ? `winner ${parsed.data.winnerId}` : 'voided',
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          if (error instanceof WagerError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Wager adjudicate error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
