import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { notFound } from '@/lib/api/handler.server';
import {
  deleteProfileLinkApi,
  updateProfileLinkApi,
} from '@/lib/profile-links/profile-links.contract';
import { profileLinkUpdateSchema } from '@/lib/profile-links/schema';
import {
  deleteProfileLink,
  toProfileLinkDTO,
  updateProfileLink,
} from '@/lib/profile-links/links.server';

/**
 * PATCH  /api/profile-links/$id — edit label / url / position.
 * DELETE /api/profile-links/$id — remove it.
 *
 * Both scope every query by `userId`, so a wrong id is a 404 rather than
 * somebody else's row.
 */
export const route = apiRoute('/api/profile-links/$id', {
  PATCH: implement(
    updateProfileLinkApi,
    { rateLimit: 'write', body: profileLinkUpdateSchema, verboseValidationErrors: true },
    async ({ userId, params, body }) => {
      const row = await updateProfileLink(userId, params.id, body);
      if (!row) return notFound('Link not found');
      return { link: toProfileLinkDTO(row) };
    },
  ),

  DELETE: implement(deleteProfileLinkApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const removed = await deleteProfileLink(userId, params.id);
    if (!removed) return notFound('Link not found');
    return { ok: true as const };
  }),
});
