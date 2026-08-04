import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
export const Route = createFileRoute('/api/profile-links/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const rows = await listProfileLinks(userId);
        return Response.json({ links: rows.map(toProfileLinkDTO) });
      }),

      POST: defineHandler(
        { rateLimit: 'write', body: profileLinkCreateSchema, verboseValidationErrors: true },
        async ({ userId, body }) => {
          try {
            const row = await addProfileLink(userId, body);
            return Response.json({ link: toProfileLinkDTO(row) });
          } catch (error) {
            if (error instanceof ProfileLinkLimitError) {
              return Response.json({ error: error.message }, { status: 400 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
