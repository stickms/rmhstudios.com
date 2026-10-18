import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { closeOffer } from '@/lib/rmhladder/community.server';

/** DELETE /api/rmhladder/referrals/$id — the offerer closes their own offer. */
export const Route = createFileRoute('/api/rmhladder/referrals/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const result = await closeOffer(userId, params.id!);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ success: true });
      }),
    },
  },
});
