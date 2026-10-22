/**
 * Connections grids — the zod input schemas for the grid API routes. Split from
 * `./connections`, which the /connections pages import for the limits and view
 * types.
 */
import { z } from 'zod';

const cell = z.string().trim().min(1).max(30);

export const createGridSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    groups: z
      .array(z.object({ label: z.string().trim().min(2).max(40), items: z.array(cell).length(4) }))
      .length(4),
  })
  .superRefine((g, ctx) => {
    const items = g.groups.flatMap((x) => x.items.map((i) => i.toLowerCase()));
    if (new Set(items).size !== 16) {
      ctx.addIssue({ code: 'custom', message: 'All 16 items must be different', path: ['groups'] });
    }
    const labels = g.groups.map((x) => x.label.toLowerCase());
    if (new Set(labels).size !== 4) {
      ctx.addIssue({ code: 'custom', message: 'Group labels must be different', path: ['groups'] });
    }
  });

export type CreateGridInput = z.infer<typeof createGridSchema>;

export const guessSchema = z.object({ items: z.array(cell).length(4) });

export const rateSchema = z.object({ rating: z.number().int().min(1).max(5) });

export const scheduleSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
