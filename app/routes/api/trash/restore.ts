import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getUserTier } from '@/lib/entitlements';
import { restoreItem } from '@/lib/trash/trash.server';
import { refusalStatus, trashWindowDays } from '@/lib/trash/types';

const bodySchema = z.object({
  kind: z.enum(['post', 'comment']),
  id: z.string().min(1).max(64),
});

/**
 * POST /api/trash/restore — put one deleted post or comment back.
 *
 * Ownership, the moderation discriminator, the retention window and the parent
 * chain are all re-checked server-side; the id is attacker-supplied and
 * restoring somebody else's deleted post is the obvious attack. Refusals carry
 * the machine-readable `reason` from `lib/trash/types` so the client can say
 * *why* — "the post this replied to no longer exists" is the acceptance
 * criterion, not a generic 400.
 */
export const Route = createFileRoute('/api/trash/restore')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user' }, body: bodySchema },
        async ({ userId, body }) => {
          const tier = await getUserTier(userId);
          const result = await restoreItem(userId, body.kind, body.id, trashWindowDays(tier));
          if (!result.ok) {
            return Response.json(
              { error: 'Restore refused', reason: result.reason },
              { status: refusalStatus(result.reason) },
            );
          }
          return Response.json({ ok: true, kind: body.kind, id: body.id });
        },
      ),
    },
  },
});
