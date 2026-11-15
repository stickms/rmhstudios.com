import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { addProfileLinkApi, listProfileLinksApi } from '@/lib/profile-links/profile-links.contract';
import { profileLinkCreateSchema } from '@/lib/profile-links/schema';
import {
  addProfileLink,
  listProfileLinks,
  toProfileLinkDTO,
  ProfileLinkLimitError,
} from '@/lib/profile-links/links.server';

/**
 * GET  /api/profile-links — the signed-in user's links (backfilled from the
 *                           legacy JSON blob on first read).
 * POST /api/profile-links — add one.
 */
export const route = apiRoute('/api/profile-links', {
  GET: implement(listProfileLinksApi, { rateLimit: 'read' }, async ({ userId }) => {
    const rows = await listProfileLinks(userId);
    return { links: rows.map(toProfileLinkDTO) };
  }),

  POST: implement(
    addProfileLinkApi,
    { rateLimit: 'write', body: profileLinkCreateSchema, verboseValidationErrors: true },
    async ({ userId, body }) => {
      try {
        const row = await addProfileLink(userId, body);
        return { link: toProfileLinkDTO(row) };
      } catch (error) {
        if (error instanceof ProfileLinkLimitError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    },
  ),
});
