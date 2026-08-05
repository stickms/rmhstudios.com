import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, notFound } from '@/lib/api/handler.server';
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
export const Route = createFileRoute('/api/profile-links/$id/')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: profileLinkUpdateSchema, verboseValidationErrors: true },
        async ({ userId, params, body }) => {
          const row = await updateProfileLink(userId, params.id, body);
          if (!row) return notFound('Link not found');
          return Response.json({ link: toProfileLinkDTO(row) });
        },
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const removed = await deleteProfileLink(userId, params.id);
        if (!removed) return notFound('Link not found');
        return Response.json({ ok: true });
      }),
    },
  },
});
