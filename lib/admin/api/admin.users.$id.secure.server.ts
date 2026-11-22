import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { previewSecureAccountApi, secureAccountApi } from '@/lib/admin/secure-account.contract';
import { secureAccountBody } from '@/lib/admin/secure-account-schema';
import { previewSecureAccount, secureAccount } from '@/lib/admin/secure-account.server';

/**
 * GET  /api/admin/users/$id/secure — what is live on the account, plus its passkeys and linked
 *                                    sign-in accounts (read-only).
 * POST /api/admin/users/$id/secure — sign out everywhere and revoke keys, tokens, webhooks and the
 *                                    calendar feed in one audited transaction. No ban.
 * Admin only; never on an admin or on yourself. New webhook secrets are never returned.
 */
export const route = apiRoute('/api/admin/users/$id/secure', {
  GET: implement(
    previewSecureAccountApi,
    {
      auth: 'admin',
      rateLimit: 'read',
    },
    async ({ params, session }) => {
      const out = await previewSecureAccount(session.user.id, params.id);
      if (!out.ok)
        return Response.json(
          {
            error: out.error,
          },
          {
            status: out.status,
          },
        );
      return out.value;
    },
  ),
  POST: implement(
    secureAccountApi,
    {
      auth: 'admin',
      rateLimit: {
        limit: 10,
        windowMs: 60_000,
        prefix: 'admin-secure',
      },
      body: secureAccountBody,
    },
    async ({ params, session, body }) => {
      const out = await secureAccount(session.user.id, params.id, body);
      if (!out.ok)
        return Response.json(
          {
            error: out.error,
          },
          {
            status: out.status,
          },
        );
      return out.value;
    },
  ),
});
