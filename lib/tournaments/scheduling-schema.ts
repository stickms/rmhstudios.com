import { z } from 'zod';

const instant = z.string().datetime();

/** The deadline choices (none = null); the values are `DEADLINE_HOURS`. */
export const deadlineHoursSchema = z.union([z.literal(24), z.literal(48), z.literal(72), z.literal(168)]).nullable();

/** A player proposes a time (an ISO instant; the client converts from the viewer's zone). */
export const proposeTimeSchema = z.object({
  at: instant,
});
export type ProposeTimeInput = z.infer<typeof proposeTimeSchema>;

/** The opponent accepts the live proposal; `proposedAt` names the one being accepted. */
export const acceptTimeSchema = z.object({
  proposedAt: instant,
});
export type AcceptTimeInput = z.infer<typeof acceptTimeSchema>;

/** The host sets the time directly, or clears it with null. */
export const hostSetTimeSchema = z.object({
  at: instant.nullable(),
});
export type HostSetTimeInput = z.infer<typeof hostSetTimeSchema>;

/** The host awards an overdue match to one of its two entrants. */
export const awardMatchSchema = z.object({
  winnerEntrantId: z.string().min(1).max(64),
});
export type AwardMatchInput = z.infer<typeof awardMatchSchema>;

/** The host's deadline setting. */
export const scheduleSettingsSchema = z.object({
  matchDeadlineHours: deadlineHoursSchema,
});
export type ScheduleSettingsInput = z.infer<typeof scheduleSettingsSchema>;
