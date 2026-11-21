/** Request schemas for /api/messages/away (client-safe types come by `import type`). */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/calendar/tz';
import { AWAY_BODY_MAX, DAY_RE } from '@/lib/messages/away';

const day = z.string().regex(DAY_RE);

/** PUT: set or change the away message. The days are in `tz`; the server turns them into instants. */
export const putAwayBody = z.object({
  body: z.string().trim().min(1).max(AWAY_BODY_MAX),
  /** Empty means "from now". */
  startDay: day.nullish(),
  endDay: day,
  tz: z.string().max(64).refine(isValidTimeZone),
  showOnProfile: z.boolean().default(false),
});

/** GET status: where the line is shown. The header needs an accepted conversation; the profile needs the member's opt-in. */
export const awayStatusQuery = z.object({
  context: z.enum(['header', 'profile']).default('header'),
});
