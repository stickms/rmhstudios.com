import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { revokeInvite } from '@/lib/communities/invites.server';

/** DELETE /api/communities/$slug/invites/$id — revoke a link (owner and moderators). Idempotent. */
export const Route = createFileRoute('/api/communities/$slug/invites/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        if (!/^\d{1,18}$/.test(params.id)) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        const revoked = await revokeInvite(guard.value.id, BigInt(params.id));
        return Response.json({ success: true, revoked });
      }),
    },
  },
});
