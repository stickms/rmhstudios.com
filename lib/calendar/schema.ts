import { z } from 'zod';
import { POLL_MAX_DAYS, POLL_MAX_INVITEES, POLL_SLOT_LENGTHS } from './poll-slots';
import { STUDY_PRESETS } from './study-buddy';
import { OFFICE_HOURS_SLOT_LENGTHS } from './office-hours';

/** Client-safe request contracts for the calendar features. */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const tz = z.string().trim().min(1).max(64);

export const createPollSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional().default(''),
  tz,
  firstDay: day,
  days: z.number().int().min(1).max(POLL_MAX_DAYS),
  dayStartHour: z.number().int().min(0).max(23),
  dayEndHour: z.number().int().min(1).max(24),
  slotMin: z
    .number()
    .int()
    .refine((n) => (POLL_SLOT_LENGTHS as readonly number[]).includes(n)),
  requiredUserIds: z.array(z.string().min(1).max(64)).max(POLL_MAX_INVITEES).optional().default([]),
  communityId: z.string().min(1).max(40).optional(),
  groupChatId: z.string().min(1).max(40).optional(),
});
export type CreatePollInput = z.infer<typeof createPollSchema>;

export const respondPollSchema = z.object({ answers: z.string().max(720) });

export const lockPollSchema = z.object({
  startMin: z.number().int(),
  endMin: z.number().int(),
});

// ── Office hours (K2) ───────────────────────────────────────────────────────

// Lives in `./office-hours` so the manage page can read it without zod.
export { OFFICE_HOURS_SLOT_LENGTHS };

export const officeHoursWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, { message: 'End must be after start' });

export const officeHoursConfigSchema = z.object({
  title: z.string().trim().max(80).default(''),
  blurb: z.string().trim().max(300).default(''),
  tz,
  slotMin: z
    .number()
    .int()
    .refine((n) => (OFFICE_HOURS_SLOT_LENGTHS as readonly number[]).includes(n)),
  maxPerWeek: z.number().int().min(1).max(100).nullable().default(null),
  enabled: z.boolean().default(true),
  windows: z.array(officeHoursWindowSchema).max(14),
});
export type OfficeHoursConfigInput = z.infer<typeof officeHoursConfigSchema>;

export const bookOfficeHoursSchema = z.object({
  startsAt: z.coerce.date(),
  note: z.string().trim().max(300).optional().default(''),
});

// ── Calendar feed (K3) ──────────────────────────────────────────────────────

export const calendarFeedPatchSchema = z.object({
  enabled: z.boolean().optional(),
  rotate: z.literal(true).optional(),
  slotIds: z.array(z.string().min(1).max(40)).max(100).optional(),
});

// ── Recurring events (K4) ───────────────────────────────────────────────────

export const eventRecurrenceSchema = z.object({
  rule: z.enum(['W', 'M']),
  tz,
  until: z.coerce.date().nullable().optional(),
  rotatingHostIds: z.array(z.string().min(1).max(64)).max(12).optional().default([]),
});

export const occurrenceRsvpSchema = z.object({
  status: z.enum(['going', 'maybe']).nullable(),
  everyTime: z.boolean().optional().default(false),
  occurrenceAt: z.coerce.date().optional(),
});

// ── Study buddy (F5) ────────────────────────────────────────────────────────

export const studyBuddyRequestSchema = z.object({
  subject: z.string().trim().min(2).max(60),
  /** A preset id, so a match works across display languages. */
  preset: z.enum(STUDY_PRESETS).optional(),
  lengthMin: z.union([z.literal(25), z.literal(50)]),
  /** Null means "now"; otherwise a slot start from `studySlotOptions`. */
  startsAt: z.coerce.date().nullable().optional(),
});
