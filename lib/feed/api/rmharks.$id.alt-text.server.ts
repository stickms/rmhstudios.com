import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { editPostAltsApi } from '@/lib/feed/alt-text-edit.contract';
import { editPostAltsBodySchema } from '@/lib/feed/alt-text-edit-schema';
import { updatePostAlts } from '@/lib/feed/alt-text-edit.server';

/**
 * `PUT /api/rmharks/$id/alt-text` — the author replaces the descriptions of their post's images (sprint 05 #16). One
 * entry per image; plain text, trimmed, 1,000 characters at most. Not a content edit: no "edited" marker, no history.
 */
export const route = apiRoute('/api/rmharks/$id/alt-text', {
  PUT: implement(
    editPostAltsApi,
    {
      rateLimit: 'write',
      body: editPostAltsBodySchema,
    },
    async ({ params, userId, body }) => {
      const result = await updatePostAlts({
        postId: params.id,
        userId,
        alts: body.alts,
        gifAlt: body.gifAlt,
      });
      if (!result.ok) {
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      }
      return {
        success: true as const,
        imageAlts: result.imageAlts,
        ...(result.gifAlt !== undefined
          ? {
              gifAlt: result.gifAlt,
            }
          : {}),
      };
    },
  ),
});
