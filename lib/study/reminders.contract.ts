/** Contracts for /api/study/reminders. Client-safe: types come from the zod schema by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { saveReminderBody } from '@/lib/study/reminders-schema';

export interface ReminderSettings {
  enabled: boolean;
  /** `HH:MM`, read in `timeZone`. */
  time: string;
  timeZone: string;
  /** ISO instant of the next reminder; null when off or paused. */
  nextAt: string | null;
  /** Paused after two weeks of reminders with no review. */
  paused: boolean;
}

/** `reminder` is null until the member saves one. */
export interface ReminderRes {
  reminder: ReminderSettings | null;
}

export const getReminderApi = endpoint<{ res: ReminderRes }>()({
  method: 'GET',
  path: '/api/study/reminders',
});

export const saveReminderApi = endpoint<{
  body: z.infer<typeof saveReminderBody>;
  res: { reminder: ReminderSettings };
}>()({ method: 'PUT', path: '/api/study/reminders' });
