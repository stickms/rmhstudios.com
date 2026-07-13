/**
 * Validation schemas for User Builds API.
 */

import { z } from 'zod';
import { httpUrl } from '@/lib/url-safety';

export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_README_LENGTH = 50000; // 50 KB
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;
export const MIN_TAG_LENGTH = 3;

const urlSchema = httpUrl(500).optional().or(z.literal(''));
const imageUrlSchema = z.string().max(500).refine(
  (val) => val === '' || val.startsWith('/') || val.startsWith('http://') || val.startsWith('https://'),
  { message: 'Invalid URL' }
).optional().or(z.literal(''));

export const createBuildSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters`),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(MAX_DESCRIPTION_LENGTH, `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`),
  readme: z
    .string()
    .max(MAX_README_LENGTH, 'README is too long')
    .optional(),
  repoUrl: urlSchema,
  demoUrl: urlSchema,
  thumbnailUrl: imageUrlSchema,
  categoryId: z.string().optional(),
  technologies: z
    .array(z.string().max(50))
    .max(20)
    .default([]),
  tags: z
    .array(
      z.string()
        .min(MIN_TAG_LENGTH, `Tag must be at least ${MIN_TAG_LENGTH} characters`)
        .max(MAX_TAG_LENGTH, `Tag must be at most ${MAX_TAG_LENGTH} characters`)
    )
    .max(MAX_TAGS, `Maximum ${MAX_TAGS} tags allowed`)
    .default([]),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).default('UNLISTED'),
  // Marketplace price in coins to unlock readme/repo/demo (0 = free).
  price: z.number().int().min(0).max(1_000_000).optional(),
});

export const updateBuildSchema = createBuildSchema
  .omit({ technologies: true, tags: true, visibility: true })
  .partial()
  .extend({
    technologies: z.array(z.string().max(50)).max(20).optional(),
    tags: z.array(
      z.string()
        .min(MIN_TAG_LENGTH, `Tag must be at least ${MIN_TAG_LENGTH} characters`)
        .max(MAX_TAG_LENGTH, `Tag must be at most ${MAX_TAG_LENGTH} characters`)
    ).max(MAX_TAGS, `Maximum ${MAX_TAGS} tags allowed`).optional(),
    visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
  });

// Admin-only fields that can be set via PATCH by admins
export const adminUpdateBuildSchema = updateBuildSchema.extend({
  isCurated: z.boolean().optional(),
  featured: z.boolean().optional(),
  userId: z.string().optional(),
  position: z.number().int().min(0).optional(),
});

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment is too long'),
  parentId: z.string().optional(),
});

export type CreateBuildInput = z.infer<typeof createBuildSchema>;
export type UpdateBuildInput = z.infer<typeof updateBuildSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
