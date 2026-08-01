import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listPendingRedemptions } from '@/lib/creator/earnings.server';

export const Route = createFileRoute('/api/admin/redemptions/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        try {
          const requests = await listPendingRedemptions({});
          return Response.json({ requests });
        } catch (error) {
          console.error('Admin redemptions list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      }),
    },
  },
});
