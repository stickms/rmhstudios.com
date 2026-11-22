import { z } from 'zod';

export const updatesQuery = z.object({
  cursor: z.string().max(80).optional(),
});

export const patchNoteEditBody = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});
