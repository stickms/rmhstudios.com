/**
 * Request schema for the lesson progress endpoint. A run is two numbers and a
 * lesson id: stars are not accepted, the server works them out
 * (`starsFor`, `lessons.ts`).
 */
import { z } from 'zod';
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

export const lessonRunBody =
  z.object(
    {
      lessonId:
        z
          .string()
          .min(
            1,
          )
          .max(
            32,
          ),
      wpm: z
        .number()
        .min(
          0,
        )
        .max(
          MAX_WPM,
        ),
      accuracy:
        z
          .number()
          .min(
            0,
          )
          .max(
            100,
          ),
    },
  );
