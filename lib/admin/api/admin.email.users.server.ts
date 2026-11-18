import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailUserSearch } from '@/lib/admin/email.contract';
import { userSearchQuerySchema } from '@/lib/email/campaign-schema';
import { searchRecipients } from '@/lib/email/campaign.server';

/** GET /api/admin/email/users?q= — find people to add to a manual selection. */
export const route =
  apiRoute(
    '/api/admin/email/users',
    {
      GET: implement(
        adminEmailUserSearch,
        {
          auth: 'admin',
          query:
            userSearchQuerySchema,
        },
        async ({
          query,
        }) => ({
          users:
            await searchRecipients(
              query.q,
            ),
        }),
      ),
    },
  );
