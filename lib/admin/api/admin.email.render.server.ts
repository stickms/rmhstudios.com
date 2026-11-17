import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailRender } from '@/lib/admin/email.contract';
import { renderBodySchema } from '@/lib/email/campaign-schema';
import { renderPreview } from '@/lib/email/campaign.server';

/**
 * POST /api/admin/email/render — the draft as a recipient gets it (plain or
 * designed), addressed to the admin, for the composer's preview pane.
 */
export const route = apiRoute('/api/admin/email/render', {
  POST: implement(
    adminEmailRender,
    {
      auth: 'admin',
      rateLimit: { limit: 120, windowMs: 60_000, scope: 'user', prefix: 'admin-email-render' },
      body: renderBodySchema,
    },
    async ({ userId, body }) => renderPreview(userId, body),
  ),
});
