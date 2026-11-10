import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getAltTextSettingApi, setAltTextSettingApi } from '@/lib/feed/alt-text.contract';
import { altTextSettingSchema } from '@/lib/feed/alt-text-schema';
import { getRequireAltText, setRequireAltText } from '@/lib/feed/alt-text.server';

/**
 * `/api/settings/alt-text` — the member's "Require alt text" switch (X12).
 * When on, posts with undescribed images are refused by the composer and by
 * the create endpoints.
 */
export const Route = createFileRoute('/api/settings/alt-text')({
  server: {
    handlers: {
      GET: implement(getAltTextSettingApi, { rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { requireAltText: await getRequireAltText(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: implement(
        setAltTextSettingApi,
        { rateLimit: 'write', body: altTextSettingSchema },
        async ({ userId, body }) =>
          Response.json({ requireAltText: await setRequireAltText(userId, body.requireAltText) }),
      ),
    },
  },
});
