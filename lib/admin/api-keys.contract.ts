/**
 * Contracts for /api/admin/api-keys (admin only). Client-safe: types only, by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminApiKeysPage, AdminApiKeyRow } from '@/lib/admin/api-keys';
import type { apiKeyPatchBody, apiKeysQuery } from '@/lib/admin/api-keys-schema';

/** Active keys ranked by the last 7 days of units, 50 a page. */
export const listAdminApiKeysApi = endpoint<{
  query: z.infer<typeof apiKeysQuery>;
  res: AdminApiKeysPage;
}>()({
  method: 'GET',
  path: '/api/admin/api-keys',
});

/** Suspend with a reason, lift, or set the admin rate cap. Answers with the key's new row. */
export const patchAdminApiKeyApi = endpoint<{
  body: z.infer<typeof apiKeyPatchBody>;
  res: {
    key: AdminApiKeyRow;
  };
}>()({
  method: 'PATCH',
  path: '/api/admin/api-keys/$id',
});
