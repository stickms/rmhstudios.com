/** Zod schema for PUT /api/study/reminders. The client reaches the type through `reminders.contract.ts`. */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/calendar/tz';
import { isGridTime } from '@/lib/study/reminders';

export const saveReminderBody = z.object({
  enabled: z.boolean(),
  /** `HH:MM` on a 15-minute grid, read in `timeZone`. */
  time: z.string().refine(isGridTime, 'Time must be HH:MM in 15-minute steps'),
  timeZone: z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown time zone'),
  /** Clear the pause and the no-review counter. Turning the reminder on from off does this too. */
  resume: z.boolean().optional(),
});
