import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { moderateContentApi } from '@/lib/moderation/admin-moderation.contract';
import { moderateContentBody } from '@/lib/moderation/admin-moderation-schema';
import { moderateContent, ModerationError } from '@/lib/moderation/content.server';

/**
 * POST /api/admin/moderation/content — remove, edit or restore a user's post,
 * reply, community, space, vibe or persona. Admin only. The reason is sent to
 * the owner; a strike and a feature timeout can ride along in the same call.
 */
export const route = apiRoute('/api/admin/moderation/content', {
  POST: implement(
    moderateContentApi,
    {
      auth: 'admin',
      rateLimit: {
        policy: 'write',
        scope: 'user',
      },
      body: moderateContentBody,
      invalid: (e) =>
        Response.json(
          {
            error: e.issues[0]?.message ?? 'Invalid input',
          },
          {
            status: 400,
          },
        ),
    },
    async ({ session, body }) => {
      try {
        return await moderateContent({
          adminId: session.user.id,
          entityType: body.entityType,
          entityId: body.entityId,
          action: body.action,
          reason: body.reason,
          fields: body.fields,
          strike: body.strike,
          restrict: body.restrict,
        });
      } catch (e) {
        if (e instanceof ModerationError) {
          return Response.json(
            {
              error: e.message,
            },
            {
              status: e.status,
            },
          );
        }
        throw e;
      }
    },
  ),
});
