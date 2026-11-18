import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailTest } from '@/lib/admin/email.contract';
import { testSendBodySchema } from '@/lib/email/campaign-schema';
import { sendTestEmail } from '@/lib/email/campaign.server';

/** POST /api/admin/email/test — send the draft to the signed-in admin only. */
export const route =
  apiRoute(
    '/api/admin/email/test',
    {
      POST: implement(
        adminEmailTest,
        {
          auth: 'admin',
          rateLimit:
            {
              limit: 10,
              windowMs: 60_000,
              prefix:
                'admin-email-test',
            },
          body: testSendBodySchema,
        },
        async ({
          userId,
          body,
        }) =>
          sendTestEmail(
            userId,
            body,
          ),
      ),
    },
  );
