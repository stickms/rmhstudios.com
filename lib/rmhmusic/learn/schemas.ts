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

/** The four answers a remembered card can be given (`srs/schedule.ts` `Grade`). */
export const GRADES = ['again', 'hard', 'good', 'easy'] as const;

/** At most this many reviews in one `POST /api/rmhmusic/learn/cards`. */
export const MAX_REVIEWS_PER_BATCH = 50;

/**
 * Body of `POST /api/rmhmusic/learn/cards`: the answers of one Practice session, in the order they
 * were given. No time is accepted: the server reviews every card with its own clock.
 */
export const reviewBatchSchema = z.object({
  reviews: z
    .array(z.object({ cardId: z.string().min(1).max(64), grade: z.enum(GRADES) }))
    .min(1)
    .max(MAX_REVIEWS_PER_BATCH),
});

export type ReviewInput = z.infer<typeof reviewBatchSchema>['reviews'][number];
