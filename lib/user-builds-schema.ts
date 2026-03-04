/**
 * Validation schemas for User Builds API.
 */

import { z } from 'zod';

export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_README_LENGTH = 50000; // 50 KB
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;
export const MIN_TAG_LENGTH = 3;

const urlSchema = z.string().url().max(500).optional().or(z.literal(''));

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
  thumbnailUrl: urlSchema,
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
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).default('PUBLIC'),
  publish: z.boolean().default(false),
});

export const updateBuildSchema = createBuildSchema.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
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
