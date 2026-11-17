import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailPreview } from '@/lib/admin/email.contract';
import { previewBodySchema } from '@/lib/email/campaign-schema';
import { previewAudience } from '@/lib/email/campaign.server';

/** POST /api/admin/email/preview — how many people an audience reaches, and a sample. */
export const route = apiRoute('/api/admin/email/preview', {
  POST: implement(
    adminEmailPreview,
    { auth: 'admin', rateLimit: { limit: 60, windowMs: 60_000, prefix: 'admin-email-preview' }, body: previewBodySchema },
    async ({ body }) =>
      previewAudience(body.audience, body.category, {
        subject: body.subject,
        body: body.body,
        imageUrls: body.imageUrls,
      }),
  ),
});
