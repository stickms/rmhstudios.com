/**
 * The request the Dunesday assistant accepts. Shared by the client (which
 * builds it from the local plan) and the route (which validates it).
 *
 * The plan lives in the browser, so the grounding has to arrive with the
 * question. It arrives as **ids and numbers, not prose**: the server resolves
 * every id against its own title list and writes the context itself, so the
 * only free text a caller controls is the question, the history and the names
 * of their own custom titles — all length-capped and labelled as data in the
 * prompt.
 */

import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(40);

export const dunesdayAskSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(12)
    .default([]),
  spoilerShield: z.boolean().default(true),
  today: day,
  plan: z.object({
    deadline: day,
    finishDate: day.nullable(),
    minutesPerDay: z.number().int().min(0).max(1440),
    mode: z.enum(['pace', 'fit']),
    remainingMinutes: z.number().int().min(0).max(100_000),
    watched: z.array(id).max(120),
    /** Series id → episodes watched. */
    partial: z.record(id, z.number().int().min(0).max(200)).default({}),
    included: z.array(id).max(150),
    upcoming: z.array(z.object({ date: day, items: z.array(z.string().max(120)).max(12) })).max(14),
    custom: z
      .array(
        z.object({ id, title: z.string().max(80), minutes: z.number().int().min(0).max(6000) }),
      )
      .max(30),
  }),
});

export type DunesdayAsk = z.infer<typeof dunesdayAskSchema>;
