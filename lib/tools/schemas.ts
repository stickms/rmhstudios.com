import { z } from 'zod';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const title = z.string().trim().min(1).max(120);

/** F4 — RMHStudy exam plan inputs (the plan itself is recomputed from these). */
export const studyPlanSchema = z.object({
  title,
  examDate: isoDay,
  topics: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().trim().min(1).max(80),
        hours: z.number().min(0.5).max(200),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(30),
  hoursByWeekday: z.array(z.number().min(0).max(16)).length(7),
});
export type StudyPlanInput = z.infer<typeof studyPlanSchema>;

/** F11 — a calculator notebook. */
export const calcNotebookSchema = z.object({
  title,
  body: z.string().max(10_000),
});

/** F15 — a custom marathon list. */
export const marathonItemSchema = z.object({
  title: z.string().trim().min(1).max(100),
  minutes: z.number().int().min(1).max(2000),
});
export const marathonListSchema = z.object({
  title,
  deadline: isoDay,
  items: z.array(marathonItemSchema).min(1).max(150),
});
export type MarathonListInput = z.infer<typeof marathonListSchema>;

export const MAX_PLANS = 20;
export const MAX_NOTEBOOKS = 30;
export const MAX_LISTS = 20;
