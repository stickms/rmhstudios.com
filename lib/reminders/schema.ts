import { z } from 'zod';

/**
 * "Remind me about this" (plan U7) — client-safe contract shared by the route
 * and the menu. The server module is `reminders.server.ts`.
 */

export const REMINDER_KINDS = ['post', 'notification', 'event', 'listing', 'page'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Pending reminders a user may hold at once. */
export const MAX_PENDING_REMINDERS = 200;
/** Furthest ahead a reminder may be set. */
export const MAX_REMINDER_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * A same-site path: one leading slash, never `//host` (protocol-relative) or a
 * backslash trick that some browsers normalise into one.
 */
export function isSiteRelativePath(url: string): boolean {
  return /^\/(?![/\\])[^\s]*$/.test(url) && url.length <= 512;
}

export const createReminderSchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  targetId: z.string().min(1).max(128),
  label: z.string().trim().min(1).max(140),
  url: z.string().refine(isSiteRelativePath, 'url must be a same-site path'),
  note: z.string().trim().max(140).optional(),
  /** Absolute instant (ISO). Presets resolve in the viewer's timezone client-side. */
  remindAt: z.string().datetime({ offset: true }),
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export interface ReminderView {
  id: string;
  kind: ReminderKind;
  targetId: string;
  label: string;
  url: string;
  note: string | null;
  remindAt: string;
}

export type ReminderPreset = 'hour' | 'tonight' | 'tomorrow' | 'week';

/**
 * Resolve a preset to an absolute time in the viewer's local clock.
 * "Tonight" is 20:00 today (or +1h if that has passed); "tomorrow" is 09:00.
 */
export function resolvePreset(preset: ReminderPreset, now = new Date()): Date {
  const d = new Date(now);
  switch (preset) {
    case 'hour':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case 'tonight': {
      d.setHours(20, 0, 0, 0);
      return d.getTime() > now.getTime() + 15 * 60 * 1000
        ? d
        : new Date(now.getTime() + 60 * 60 * 1000);
    }
    case 'tomorrow':
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    case 'week':
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
  }
}
