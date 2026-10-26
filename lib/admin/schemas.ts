import { z } from 'zod';
import { handleSchema } from '@/lib/handle-schema';

export const adminUserUpdateSchema = z
  .object({
    userId: z.string().min(1).max(128),
    isVerified: z.boolean().optional(),
    isAdmin: z.boolean().optional(),
    handle: handleSchema.optional(),
  })
  .refine(
    (value) =>
      value.isVerified !== undefined || value.isAdmin !== undefined || value.handle !== undefined,
  );

export const blogPostSchema = z.object({
  title: z.string().min(1).max(300),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(10_000),
  image: z.string().max(2048).nullish(),
  date: z.string().min(1).max(50),
  tags: z
    .union([z.array(z.string().max(100)).max(50), z.string().max(100)])
    .default([])
    .transform((value) => (typeof value === 'string' ? (value.trim() ? [value] : []) : value)),
  content: z.string().min(1).max(2_000_000),
  isEdit: z.boolean().default(false),
});
