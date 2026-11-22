/**
 * Contracts for /api/admin/webhooks (admin only). Client-safe: types only, by `import type`.
 * No response carries a secret, a payload, a signature or a URL beyond its host and first path segment.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminWebhookDetail, AdminWebhookRow, AdminWebhooksPage } from '@/lib/admin/webhooks';
import type { webhookPatchBody, webhooksQuery } from '@/lib/admin/webhooks-schema';

/** Endpoints, newest first, 50 a page, with their 24-hour delivery figures. */
export const listAdminWebhooksApi = endpoint<{
  query: z.infer<typeof webhooksQuery>;
  res: AdminWebhooksPage;
}>()({
  method: 'GET',
  path: '/api/admin/webhooks',
});

/** One endpoint and its last 50 deliveries. */
export const getAdminWebhookApi = endpoint<{
  res: AdminWebhookDetail;
}>()({
  method: 'GET',
  path: '/api/admin/webhooks/$id',
});

/** Turn an endpoint off with a reason the owner reads, or lift that. Answers with the endpoint's new row. */
export const patchAdminWebhookApi = endpoint<{
  body: z.infer<typeof webhookPatchBody>;
  res: { webhook: AdminWebhookRow };
}>()({
  method: 'PATCH',
  path: '/api/admin/webhooks/$id',
});
