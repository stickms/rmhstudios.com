/**
 * Zod schemas for the member-made board endpoints. Kept apart from `boards.ts`, which the pages import and which must
 * not pull zod onto a client route; the contract imports the inferred types only.
 */
import { z } from 'zod';
import { MAX_PRESSES, MAX_TITLE_LENGTH, isAllowedShape } from './boards';

const storedShape = z
  .object({
    type: z.enum(['rect', 'triangle', 'custom']),
    rows: z.number().int().optional(),
    cols: z.number().int().optional(),
    size: z.number().int().optional(),
    label: z.string().max(40).optional(),
  })
  .strict()
  .refine((s) => isAllowedShape(s) !== null, { message: 'Shape not allowed' })
  .transform((s) => {
    if (s.type === 'rect') return { type: 'rect' as const, rows: s.rows as number, cols: s.cols as number };
    if (s.type === 'triangle') return { type: 'triangle' as const, size: s.size as number };
    return { type: 'custom' as const, label: s.label as string };
  });

export const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  shape: storedShape,
  cells: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[01]+$/),
});

export const solveBoardSchema = z.object({
  presses: z
    .array(z.tuple([z.number().int().min(0).max(31), z.number().int().min(0).max(31)]))
    .min(1)
    .max(MAX_PRESSES),
});

export const listBoardsQuery = z.object({
  tab: z.enum(['recent', 'played', 'mine']).default('recent'),
  cursor: z.string().max(200).optional(),
});
