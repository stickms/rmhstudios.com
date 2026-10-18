import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { communitySettingsSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { updateCommunitySettings } from '@/lib/communities/settings.server';

/**
 * PATCH /api/communities/$slug/settings — mods set the posting requirement (S2),
 * "flair required" (N1) and the starboard threshold (N2).
 */
export const Route = createFileRoute('/api/communities/$slug/settings')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: communitySettingsSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          const settings = await updateCommunitySettings(guard.value.id, body);
          if (!settings) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ settings });
        },
      ),
    },
  },
});
