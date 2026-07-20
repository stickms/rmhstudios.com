/**
 * Custom status — client-safe logic (zod schema, expiry math, presets).
 * Feature §10 of docs/plans/2026-07-20-parity-qol-customization-design.md.
 *
 * A status is a short emoji + text presence line stored on `UserProfile`
 * (`statusEmoji`/`statusText`/`statusExpires`/`statusAuto`). Expiry is enforced
 * at **read time** by {@link resolveStatus} — a past `statusExpires` renders as
 * no status even before any sweep runs — so this module is imported by both the
 * server (profile payload) and the client (editor).
 */
import { z } from 'zod';

export const STATUS_MAX_TEXT = 80;
export const STATUS_MAX_EMOJI = 16;

export type StatusExpiresIn = '30m' | '1h' | 'today';

export interface UserStatus {
  emoji: string | null;
  text: string;
}

/** The raw status columns as stored on `UserProfile`. */
export interface StatusFields {
  statusEmoji?: string | null;
  statusText?: string | null;
  statusExpires?: Date | string | null;
}

/**
 * Resolve the display status for a profile row, honoring expiry at read time.
 * Returns `null` when there is no status set or it has expired.
 */
export function resolveStatus(
  profile: StatusFields | null | undefined,
  now: number = Date.now(),
): UserStatus | null {
  if (!profile) return null;
  const emoji = profile.statusEmoji?.trim() || null;
  const text = profile.statusText?.trim() || '';
  if (!emoji && !text) return null;
  if (profile.statusExpires) {
    const exp =
      typeof profile.statusExpires === 'string'
        ? Date.parse(profile.statusExpires)
        : profile.statusExpires.getTime();
    if (Number.isFinite(exp) && exp < now) return null;
  }
  return { emoji, text };
}

/**
 * The absolute expiry `Date` for an `expiresIn` choice, or `null` for "until
 * cleared". `today` means end of the current UTC day.
 */
export function statusExpiresAt(
  expiresIn: StatusExpiresIn | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!expiresIn) return null;
  if (expiresIn === '30m') return new Date(now.getTime() + 30 * 60_000);
  if (expiresIn === '1h') return new Date(now.getTime() + 60 * 60_000);
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** PUT body for `/api/profile/status`. A full replace of the status. */
export const statusUpdateSchema = z.object({
  emoji: z.string().max(STATUS_MAX_EMOJI).nullable().optional(),
  text: z.string().max(STATUS_MAX_TEXT).nullable().optional(),
  expiresIn: z.enum(['30m', '1h', 'today']).nullable().optional(),
  auto: z.boolean().optional(),
});

export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;

export interface StatusPreset {
  emoji: string;
  /** i18n key suffix under the `c-status` namespace. */
  key: string;
  /** English default. */
  text: string;
}

/** Quick-pick statuses shown in the editor. */
export const STATUS_PRESETS: StatusPreset[] = [
  { emoji: '🎮', key: 'preset-gaming', text: 'Grinding the pass' },
  { emoji: '📚', key: 'preset-studying', text: 'Studying' },
  { emoji: '🎧', key: 'preset-vibing', text: 'Vibing' },
  { emoji: '💤', key: 'preset-afk', text: 'AFK' },
  { emoji: '🛠️', key: 'preset-building', text: 'Building something' },
];
