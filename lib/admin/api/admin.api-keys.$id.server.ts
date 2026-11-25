import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { patchAdminApiKeyApi } from '@/lib/admin/api-keys.contract';
import { apiKeyPatchBody, isReservedSuspendReason } from '@/lib/admin/api-keys-schema';
import { refusalBody } from '@/lib/errors/codes';
import { changeApiKey } from '@/lib/admin/api-keys.server';

/**
 * PATCH /api/admin/api-keys/$id — suspend with a reason (`suspend: { reason }`), lift (`suspend: null`)
 * or set the admin rate cap (`adminRateLimitPerMinute`, 1-600 or null). Admin only; each change is
 * audited in the same transaction and a suspension or lift notifies the key's owner.
 */
export const route = apiRoute('/api/admin/api-keys/$id', {
  PATCH: implement(
    patchAdminApiKeyApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: apiKeyPatchBody,
    },
    async ({ params, session, body }) => {
      if (body.suspend && isReservedSuspendReason(body.suspend.reason))
        return Response.json(refusalBody('API_KEY_REASON_RESERVED'), { status: 400 });
      const out = await changeApiKey(session.user.id, params.id, body);
      if (!out.ok)
        return Response.json(
          {
            error: out.error,
          },
          {
            status: out.status,
          },
        );
      return {
        key: out.key,
      };
    },
  ),
});
