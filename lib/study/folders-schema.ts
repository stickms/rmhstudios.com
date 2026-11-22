import { z } from 'zod';
import { FOLDER_NAME_MAX } from '@/lib/study/folders';

const name = z.string().trim().min(1).max(FOLDER_NAME_MAX);

export const createFolderBody = z.object({ name });

/** One change at a time: a new name, the collapse state, or a step up or down the order. */
export const updateFolderBody = z
  .object({
    name: name.optional(),
    collapsed: z.boolean().optional(),
    move: z.enum(['up', 'down']).optional(),
  })
  .refine((b) => Object.values(b).filter((v) => v !== undefined).length === 1, {
    message: 'Send exactly one change',
  });

export const moveDeckBody = z.object({
  folderId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .nullable(),
});

/** `?folder=` on the review queue. */
export const folderParam = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
