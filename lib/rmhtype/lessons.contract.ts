/**
 * Contracts for the RMHType course progress (`/api/rmhtype/lessons/progress`).
 * Client-safe: types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LessonProgressRow, RecordedRun } from '@/lib/rmhtype/lessons';
import type { lessonRunBody } from '@/lib/rmhtype/lessons-schema';

/** The caller's progress, one row per lesson they have finished at least once. */
export const getLessonProgressApi = endpoint<{
  res: {
    progress: LessonProgressRow[];
  };
}>()({
  method: 'GET',
  path: '/api/rmhtype/lessons/progress',
});

/** Record one finished run; the server recomputes stars and keeps the bests. */
export const recordLessonRunApi = endpoint<{
  body: z.infer<typeof lessonRunBody>;
  res: RecordedRun;
}>()({
  method: 'POST',
  path: '/api/rmhtype/lessons/progress',
});
