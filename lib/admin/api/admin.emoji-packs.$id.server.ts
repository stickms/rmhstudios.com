/**
 * POST /api/admin/emoji-packs/$id — approve or remove a pack. Admin only.
 * Body: { action: 'approve' | 'remove', reason?: string, version?: ISO datetime }
 *
 * `moderatePack` is a compare-and-swap, so a decision that lost a race — the
 * pack was already decided, or its owner edited it after the queue loaded
 * (`version` no longer matches) — answers 409 and changes nothing.
 */
import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { moderatePackSchema } from '@/lib/emoji/packs-schema';
import { moderatePack, PackError } from '@/lib/emoji/packs.server';

export const route = apiRoute('/api/admin/emoji-packs/$id', {
  POST: implement(
    C.moderateAdminEmojiPackApi,
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
});
