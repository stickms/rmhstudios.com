/**
 * Contracts for the admin tools that were still raw fetches (redesign audit C1,
 * batch 8): the redemption review, the audit log list and the blog post save and
 * delete. Client-safe: types only, by `import type`.
 *
 * Not here on purpose: the multipart uploads (announcement images, studio
 * challenge art) and the CPU-profile download, which reads a blob.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { blogPostSchema } from '@/lib/admin/schemas';
import type { reviewRedemption } from '@/lib/creator/earnings.server';
import type { reviewRedemptionSchema } from '@/lib/creator/redemption-schema';

/** Approve, decline (refunds the coins) or fulfil a redemption request. */
export const reviewRedemptionApi = endpoint<{
  body: z.infer<typeof reviewRedemptionSchema>;
  res: { ok: true } & Awaited<ReturnType<typeof reviewRedemption>>;
}>()({ method: 'POST', path: '/api/admin/redemptions/$id' });

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
  admin: { name: string | null; image: string | null; handle: string | null };
}

/** The same filters drive the CSV download (`format=csv`), which is a plain link. */
export const listAuditLogApi = endpoint<{
  query: {
    action?: string | undefined;
    targetType?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  };
  res: { items: AuditLogEntry[]; nextCursor: string | null };
}>()({ method: 'GET', path: '/api/admin/audit-log' });

/** Create (409 on a taken slug) or edit (`isEdit`, 404 when missing) a blog post. */
export const saveBlogPostApi = endpoint<{
  body: z.infer<typeof blogPostSchema>;
  res: { success: true; slug: string };
}>()({ method: 'POST', path: '/api/admin/blog' });

export const deleteBlogPostApi = endpoint<{
  query: { slug: string };
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/admin/blog' });
