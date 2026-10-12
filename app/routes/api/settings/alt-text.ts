import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { altTextSettingSchema } from '@/lib/feed/alt-text';
import { getRequireAltText, setRequireAltText } from '@/lib/feed/alt-text.server';

/**
 * `/api/settings/alt-text` — the member's "Require alt text" switch (X12).
 * When on, posts with undescribed images are refused by the composer and by
 * the create endpoints.
 */
export const Route = createFileRoute('/api/settings/alt-text')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { requireAltText: await getRequireAltText(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: altTextSettingSchema },
        async ({ userId, body }) =>
          Response.json({ requireAltText: await setRequireAltText(userId, body.requireAltText) }),
      ),
    },
  },
});
