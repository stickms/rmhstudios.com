import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminApiKeysApi } from '@/lib/admin/api-keys.contract';
import { apiKeysQuery } from '@/lib/admin/api-keys-schema';
import { listApiKeys } from '@/lib/admin/api-keys.server';

/**
 * GET /api/admin/api-keys — live developer API keys ranked by the last 7 days of units, with usage,
 * error and refusal rates and webhook health (cursor paginated, 50 a page). Admin only; never a hash,
 * a secret, an allowed range or an e-mail address.
 */
export const route = apiRoute('/api/admin/api-keys', {
  GET: implement(
    listAdminApiKeysApi,
    {
      auth: 'admin',
      rateLimit: 'read',
      query: apiKeysQuery,
    },
    async ({ query }) => {
      const page = await listApiKeys(query);
      if (!page)
        return Response.json(
          {
            error: 'Invalid cursor',
          },
          {
            status: 400,
          },
        );
      return page;
    },
  ),
});
