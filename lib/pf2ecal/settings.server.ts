/**
 * The board's singleton settings row.
 *
 * Its own module rather than living in `reminders.server.ts`, because both the
 * board reader (`sessions.server.ts`, which returns the masked webhook with the
 * rest of the state) and the reminder sweep need it — and having the reader
 * import the sweep while the sweep imports the reader is a cycle. Settings are
 * a leaf: they depend on Prisma and nothing else in this feature.
 */

import { prisma } from '@/lib/prisma.server';

/** The fixed primary key. See `Pf2eSettings` in `prisma/schema.prisma`. */
export const SETTINGS_ID = 'singleton';

export interface BoardSettings {
  discordWebhookUrl: string | null;
  remindersEnabled: boolean;
  /** Minutes past local midnight; 540 = 9:00am. */
  reminderMinutes: number;
  reminderTimeZone: string;
}

/**
 * The defaults a board has before anyone opens settings.
 *
 * Reminders are OFF here, and stay off until someone explicitly enables them:
 * a feature that starts posting to a Discord channel the moment it ships is a
 * feature that gets turned off in anger.
 */
export const DEFAULT_SETTINGS: BoardSettings = {
  discordWebhookUrl: null,
  remindersEnabled: false,
  reminderMinutes: 9 * 60,
  reminderTimeZone: 'America/New_York',
};

/** Read the settings row, or the defaults when nobody has saved any yet. */
export async function getSettings(): Promise<BoardSettings> {
  const row = await prisma.pf2eSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    discordWebhookUrl: row.discordWebhookUrl,
    remindersEnabled: row.remindersEnabled,
    reminderMinutes: row.reminderMinutes,
    reminderTimeZone: row.reminderTimeZone,
  };
}
