import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getContentWarningSettingApi, setContentWarningSettingApi } from '@/lib/feed/content-warning-settings.contract';
import { contentWarningSettingSchema } from '@/lib/feed/content-warning-schema';
import { getShowContentWarnings, setShowContentWarnings } from '@/lib/feed/content-warning-settings.server';

/**
 * `/api/settings/content-warnings` - the member's "Posts with content warnings" choice: cover them (default) or show
 * them. The server always sends the text to a viewer who can reveal it; this only changes the client's default.
 */
export const route = apiRoute('/api/settings/content-warnings', {
  GET: implement(getContentWarningSettingApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(
      { showContentWarnings: await getShowContentWarnings(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
  POST: implement(
    setContentWarningSettingApi,
    { rateLimit: 'write', body: contentWarningSettingSchema },
    async ({ userId, body }) =>
      Response.json({ showContentWarnings: await setShowContentWarnings(userId, body.showContentWarnings) }),
  ),
});
