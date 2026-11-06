/**
 * POST /api/admin/emoji-packs/$id — approve or remove a pack. Admin only.
 * Body: { action: 'approve' | 'remove', reason?: string, version?: ISO datetime }
 *
 * `moderatePack` is a compare-and-swap, so a decision that lost a race — the
 * pack was already decided, or its owner edited it after the queue loaded
 * (`version` no longer matches) — answers 409 and changes nothing.
 */
import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { moderatePackSchema } from '@/lib/emoji/packs-schema';
import { moderatePack, PackError } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/admin/emoji-packs/$id')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'admin',
          rateLimit: { policy: 'write', scope: 'user' },
          body: moderatePackSchema,
        },
        async ({ params, userId, body }) => {
          try {
            const result = await moderatePack(
              params.id,
              body.action,
              userId,
              body.reason,
              body.version ? new Date(body.version) : undefined,
            );
            if (!result.applied) {
              return Response.json(
                {
                  error: 'This pack was already decided or changed since it was loaded.',
                  status: result.status,
                },
                { status: 409 },
              );
            }
            return Response.json({ ok: true, status: result.status });
          } catch (err) {
            if (err instanceof PackError) return apiError(err.message, err.status);
            throw err;
          }
        },
      ),
    },
  },
});
