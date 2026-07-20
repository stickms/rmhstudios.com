/**
 * Notification center v2 — categories, channel resolution, quiet-hours math
 * (§16 of docs/plans/2026-07-20-parity-qol-customization-design.md).
 * Client-safe (settings UI + the dispatch gateway).
 */
import { z } from 'zod';

export const NOTIFY_CATEGORIES = ['social', 'replies', 'follows', 'economy', 'events', 'system'] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export interface ChannelPrefs {
  inapp: boolean;
  push: boolean;
  email: boolean;
}

/** Per-category channel defaults. Email defaults off except for `system`. */
export const CATEGORY_DEFAULTS: Record<NotifyCategory, ChannelPrefs> = {
  social: { inapp: true, push: true, email: false },
  replies: { inapp: true, push: true, email: false },
  follows: { inapp: true, push: true, email: false },
  economy: { inapp: true, push: true, email: false },
  events: { inapp: true, push: true, email: false },
  system: { inapp: true, push: true, email: true },
};

export type NotifyMatrix = Partial<Record<NotifyCategory, Partial<ChannelPrefs>>>;

/** Resolve the effective channels for a category (matrix over defaults). */
export function resolveChannels(matrix: NotifyMatrix | undefined, category: NotifyCategory): ChannelPrefs {
  const base = CATEGORY_DEFAULTS[category];
  const override = matrix?.[category];
  if (!override) return base;
  return {
    inapp: override.inapp ?? base.inapp,
    push: override.push ?? base.push,
    email: override.email ?? base.email,
  };
}

/**
 * Whether `nowMinutes` (minutes from midnight, user tz) falls inside the quiet
 * window. Handles cross-midnight windows (e.g. 22:00–07:00).
 */
export function inQuietHours(
  nowMinutes: number,
  quietStart: number | null | undefined,
  quietEnd: number | null | undefined,
): boolean {
  if (quietStart == null || quietEnd == null) return false;
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return nowMinutes >= quietStart && nowMinutes < quietEnd;
  // Cross-midnight: inside if after start OR before end.
  return nowMinutes >= quietStart || nowMinutes < quietEnd;
}

/** Minutes-from-midnight in a given IANA tz for a UTC instant. */
export function minutesInTz(date: Date, tz: string | null | undefined): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return (h % 24) * 60 + m;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

const channelSchema = z.object({
  inapp: z.boolean().optional(),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
});

export const notifPrefsSchema = z.object({
  // partialRecord: any subset of categories may be present, unknown keys rejected.
  matrix: z.partialRecord(z.enum(NOTIFY_CATEGORIES), channelSchema).optional(),
  quietStart: z.number().int().min(0).max(1439).nullable().optional(),
  quietEnd: z.number().int().min(0).max(1439).nullable().optional(),
  tz: z.string().max(40).nullable().optional(),
  emailDigest: z.boolean().optional(),
});

export type NotifPrefsInput = z.infer<typeof notifPrefsSchema>;

export const CATEGORY_LABELS: Record<NotifyCategory, string> = {
  social: 'Likes & reposts',
  replies: 'Replies & mentions',
  follows: 'Follows',
  economy: 'Tips, awards & sales',
  events: 'Events & live',
  system: 'System',
};
