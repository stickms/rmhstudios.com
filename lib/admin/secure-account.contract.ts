/**
 * Contracts for securing a member's account (admin only). Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  SecureAccountPreview,
  SecureAccountResult,
} from '@/lib/admin/secure-account';
import type { secureAccountBody } from '@/lib/admin/secure-account-schema';

/** What is live on the account and which sign-in methods it has (read-only). */
export const previewSecureAccountApi =
  endpoint<{
    res: SecureAccountPreview;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/users/$id/secure',
    },
  );

/** Sign out everywhere and revoke keys, tokens, webhooks and the calendar feed, without a ban. */
export const secureAccountApi =
  endpoint<{
    body: z.infer<
      typeof secureAccountBody
    >;
    res: SecureAccountResult;
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/users/$id/secure',
    },
  );
