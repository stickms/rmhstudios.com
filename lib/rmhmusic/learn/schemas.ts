import { z } from 'zod';

export const INSTRUMENTS = ['piano', 'guitar'] as const;
export const INPUTS = ['screen', 'keys', 'midi', 'mic'] as const;

export type Instrument = (typeof INSTRUMENTS)[number];
export type LearnInput = (typeof INPUTS)[number];

/** Body of `PUT /api/rmhmusic/learn/profile`. */
export const profileSchema = z.object({
  instrument: z.enum(INSTRUMENTS),
  input: z.enum(INPUTS),
  latencyMs: z.number().int().min(-500).max(500),
  dailyGoal: z.number().int().min(1).max(10),
});

/** Body of `POST /api/rmhmusic/learn/lesson-complete`. */
export const lessonCompleteSchema = z.object({
  lessonId: z.string().min(1).max(64),
  stars: z.number().int().min(0).max(3),
  score: z.number().int().min(0).max(100),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type LessonCompleteInput = z.infer<typeof lessonCompleteSchema>;
