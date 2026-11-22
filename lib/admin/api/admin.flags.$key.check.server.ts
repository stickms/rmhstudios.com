import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { checkFlagApi } from '@/lib/flags/targeting.contract';
import { checkQuery } from '@/lib/flags/targeting-schema';
import { checkFlagForHandle } from '@/lib/flags/targeting.server';
import { isValidFlagKey } from '@/lib/flags/key';

/**
 * GET /api/admin/flags/$key/check?handle= — how the flag resolves for one member and why (admin only). Reads the
 * stored flag, so it shows what the next cache load will serve; it returns the member's display name and handle,
 * never the lists.
 */
export const route = apiRoute('/api/admin/flags/$key/check', {
  GET: implement(
    checkFlagApi,
    {
      auth: 'admin',
      rateLimit: 'read',
      query: checkQuery,
    },
    async ({ params, query }) => {
      const result = isValidFlagKey(params.key) ? await checkFlagForHandle(params.key, query.handle) : null;
      return (
        result ??
        Response.json(
          {
            error: 'Not found',
          },
          {
            status: 404,
          },
        )
      );
    },
  ),
});
