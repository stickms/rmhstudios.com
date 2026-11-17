import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailCampaigns, adminEmailSend } from '@/lib/admin/email.contract';
import { createCampaignBodySchema } from '@/lib/email/campaign-schema';
import { createCampaign, listCampaigns } from '@/lib/email/campaign.server';

/**
 * GET  /api/admin/email/campaigns — the most recent sends, with progress.
 * POST /api/admin/email/campaigns — send a campaign. Resolves the audience now
 *      and returns once the recipients are queued; the send runs in the jobs worker.
 */
export const route = apiRoute('/api/admin/email/campaigns', {
  GET: implement(adminEmailCampaigns, { auth: 'admin' }, async () => ({
    campaigns: await listCampaigns(),
  })),
  POST: implement(
    adminEmailSend,
    { auth: 'admin', rateLimit: { limit: 5, windowMs: 60_000, prefix: 'admin-email-send' }, body: createCampaignBodySchema },
    async ({ userId, body }) => createCampaign(userId, body),
  ),
});
