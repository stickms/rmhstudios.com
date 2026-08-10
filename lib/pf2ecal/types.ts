/**
 * The client contract for `/pf2ecal` — the shapes the API returns and the zod
 * schemas that guard what it accepts.
 *
 * Client-safe by construction (no Prisma import): the page, the API routes and
 * the .ics feed all read the same definitions, so a field added here shows up
 * as a type error everywhere it is not yet handled.
 *
 * Instants cross the wire as ISO strings. They are parsed back into `Date` at
 * exactly one place on the client (`toSession` below) so no component has to
 * remember whether it is holding a string or a date.
 */

import { z } from 'zod';

export const AVAILABILITY = ['GOING', 'TENTATIVE', 'UNAVAILABLE'] as const;
export type Availability = (typeof AVAILABILITY)[number];

/** A player's answer, as rendered beside a session. */
export interface SessionResponseDTO {
  userId: string;
  status: Availability;
  note: string | null;
  name: string;
  image: string | null;
  updatedAt: string;
}

/**
 * The generated description of a session: a line for the card, a paragraph for
 * the sheet.
 *
 * Nullable everywhere it appears, and that is the contract, not an oversight —
 * there may be no AI configured, the model may have failed every retry, or the
 * session may simply not have been asked about yet. Everything that renders it
 * has a fallback to what the person typed.
 */
export interface SessionBlurbDTO {
  short: string;
  long: string;
}

export interface SessionDTO {
  id: string;
  title: string;
  notes: string;
  location: string;
  startsAt: string;
  endsAt: string;
  canceledAt: string | null;
  /** True while the session still tracks the recurring rule. */
  fromRule: boolean;
  createdByName: string | null;
  updatedByName: string | null;
  responses: SessionResponseDTO[];
  /** Cached AI description, or null until one has been generated. */
  blurb: SessionBlurbDTO | null;
}

export interface AnnouncementDTO {
  id: string;
  body: string;
  pinned: boolean;
  authorName: string | null;
  authorImage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Board settings as the client sees them — the webhook is masked, never raw. */
export interface SettingsDTO {
  /** `discord.com/…/123/…ab12`, or null when none is saved. Never the secret. */
  webhookMasked: string | null;
  remindersEnabled: boolean;
  /** Minutes past local midnight. 540 = 9:00am. */
  reminderMinutes: number;
  reminderTimeZone: string;
}

export interface CalendarStateDTO {
  sessions: SessionDTO[];
  announcements: AnnouncementDTO[];
  /** Null when the viewer is signed out — the page is readable either way. */
  viewerId: string | null;
  viewerName: string | null;
  /** Human sentence describing the standing rule, e.g. for the header note. */
  scheduleNote: string;
  /** Absolute URL of the subscribe feed, so the client never rebuilds it. */
  feedUrl: string;
  /** Window the server generated occurrences for, as ISO instants. */
  windowStart: string;
  windowEnd: string;
  settings: SettingsDTO;
}

/* -------------------------------------------------------------------------- */
/* Client-side shapes (dates parsed once)                                     */
/* -------------------------------------------------------------------------- */

export interface Session extends Omit<SessionDTO, 'startsAt' | 'endsAt' | 'canceledAt'> {
  startsAt: Date;
  endsAt: Date;
  canceledAt: Date | null;
}

export function toSession(dto: SessionDTO): Session {
  return {
    ...dto,
    startsAt: new Date(dto.startsAt),
    endsAt: new Date(dto.endsAt),
    canceledAt: dto.canceledAt ? new Date(dto.canceledAt) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Column widths are mirrored here rather than inferred: `@db.VarChar(120)` is a
 * hard truncation in Postgres, and a 121-character title should be a 400 with a
 * message, not a silently shortened row.
 */
export const TITLE_MAX = 120;
export const NOTES_MAX = 4000;
export const LOCATION_MAX = 300;
export const RESPONSE_NOTE_MAX = 200;
export const ANNOUNCEMENT_MAX = 2000;

/** A session may not run longer than this — catches a mistyped end date. */
export const MAX_SESSION_HOURS = 24;

const isoInstant = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' });

/**
 * Shared by create and edit. `superRefine` rather than two `.refine()`s so both
 * range problems can be reported against the field that is wrong — the form
 * shows the message under `endsAt`, which is the one the user can fix.
 */
const sessionShape = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  notes: z.string().max(NOTES_MAX).default(''),
  location: z.string().max(LOCATION_MAX).default(''),
  startsAt: isoInstant,
  endsAt: isoInstant,
});

function checkRange(value: { startsAt: string; endsAt: string }, ctx: z.RefinementCtx): void {
  const start = Date.parse(value.startsAt);
  const end = Date.parse(value.endsAt);
  if (end <= start) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'The end time must come after the start time.',
    });
    return;
  }
  if (end - start > MAX_SESSION_HOURS * 3_600_000) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: `A session cannot run longer than ${MAX_SESSION_HOURS} hours.`,
    });
  }
}

export const createSessionSchema = sessionShape.superRefine(checkRange);

/**
 * Edit accepts a partial patch plus `canceled`, so the same endpoint handles
 * "move it an hour later", "rename it" and "call it off" without three routes.
 * The range check only runs when both ends are present; a patch that moves only
 * the start is range-checked on the server against the stored end.
 */
export const updateSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    notes: z.string().max(NOTES_MAX).optional(),
    location: z.string().max(LOCATION_MAX).optional(),
    startsAt: isoInstant.optional(),
    endsAt: isoInstant.optional(),
    canceled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

export const respondSchema = z.object({
  status: z.enum(AVAILABILITY),
  note: z.string().trim().max(RESPONSE_NOTE_MAX).nullish(),
});

/**
 * Settings patch.
 *
 * `webhookUrl` is tri-state on purpose and the three states mean different
 * things: absent leaves the stored URL alone (so toggling reminders does not
 * require re-pasting a secret the client was never given), `null` clears it,
 * and a string replaces it. A single nullable field could not express "don't
 * touch it", which is the common case.
 */
export const settingsSchema = z
  .object({
    webhookUrl: z.string().max(500).nullish(),
    remindersEnabled: z.boolean().optional(),
    // 0..1439: minutes past midnight, so 1440 would be the next day's 00:00.
    reminderMinutes: z.number().int().min(0).max(1439).optional(),
    reminderTimeZone: z.string().min(1).max(64).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

export const testWebhookSchema = z.object({
  webhookUrl: z.string().min(1).max(500),
});

/**
 * The ids a client is asking for descriptions of.
 *
 * Capped at six because the endpoint costs money per id and the client only
 * ever asks about the cards it has actually put on screen. The cap is enforced
 * here so an unbounded array is a 400 rather than a bill.
 */
export const blurbRequestSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(6),
});

export const announcementSchema = z.object({
  body: z.string().trim().min(1).max(ANNOUNCEMENT_MAX),
  pinned: z.boolean().default(false),
});

export const updateAnnouncementSchema = z
  .object({
    body: z.string().trim().min(1).max(ANNOUNCEMENT_MAX).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type RespondInput = z.infer<typeof respondSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
