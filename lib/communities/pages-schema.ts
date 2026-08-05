/**
 * Wire schemas for community wiki pages (F21). Client-safe.
 */

import { z } from 'zod';
import {
  EDIT_POLICIES,
  MAX_PAGE_BODY,
  MAX_PAGE_SLUG,
  MAX_PAGE_TITLE,
  MAX_REVISION_SUMMARY,
} from '@/lib/communities/page-policy';

export const communityPageCreateSchema = z.object({
  communityId: z.string().cuid(),
  title: z.string().trim().min(2).max(MAX_PAGE_TITLE),
  body: z.string().min(1).max(MAX_PAGE_BODY),
  slug: z.string().trim().max(MAX_PAGE_SLUG).optional(),
  editPolicy: z.enum(EDIT_POLICIES).optional(),
  pinned: z.boolean().optional(),
});

export const communityPageUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(MAX_PAGE_TITLE).optional(),
    body: z.string().min(1).max(MAX_PAGE_BODY).optional(),
    summary: z.string().trim().max(MAX_REVISION_SUMMARY).nullable().optional(),
    editPolicy: z.enum(EDIT_POLICIES).optional(),
    pinned: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.body !== undefined ||
      v.editPolicy !== undefined ||
      v.pinned !== undefined,
    { message: 'Nothing to update' },
  );

export const communityPageRollbackSchema = z.object({
  revisionId: z.string().regex(/^\d+$/, 'Invalid revision'),
});

export const communityPageListQuerySchema = z.object({
  communityId: z.string().cuid().optional(),
  slug: z.string().trim().max(60).optional(),
  communitySlug: z.string().trim().max(60).optional(),
});
