/**
 * Contracts for /api/preferences/** and /api/notifications/** (redesign audit
 * C1, batch 2). Client-safe: request types come from the zod schemas by
 * `import type`, so no zod ships to the client.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AppearanceComfortInput } from '@/lib/appearance/prefs-schema';
import type { layoutPrefsSchema } from '@/lib/home-widgets-schema';
import type { notifPrefsSchema } from '@/lib/notify/categories-schema';
import type { PresenceVisibility } from '@/lib/presence-types';
import type { presencePrivacySchema } from '@/lib/presence-types-schema';

/* ── Appearance ───────────────────────────────────────────────────────────── */

/** The saved row; nulls mean "use the default". */
export interface AppearancePrefs {
  style: string | null;
  accent: string | null;
  fontScale: number | null;
  density: string | null;
  readableFont: boolean;
  customAccent: string | null;
  colorVision: string | null;
  navTransition: string | null;
  alwaysEvertGlobe: boolean;
  eversionLevel: string | null;
  jellyMotion: string | null;
  electricArcs: string | null;
}

/** Partial upsert: a field left out is unchanged, an explicit null clears it. */
export type AppearancePrefsInput = {
  style?: string | null;
  accent?: string | null;
} & AppearanceComfortInput;

export const getAppearancePrefsApi = endpoint<{ res: AppearancePrefs }>()({
  method: 'GET',
  path: '/api/preferences/appearance',
});

export const setAppearancePrefsApi = endpoint<{
  body: AppearancePrefsInput;
  res: AppearancePrefs;
}>()({ method: 'PUT', path: '/api/preferences/appearance' });

/* ── Layout ───────────────────────────────────────────────────────────────── */

type LayoutInput = z.infer<typeof layoutPrefsSchema>;

/** Normalised layout (unknown ids dropped) — `parseLayoutPref`'s output. */
export interface LayoutPrefs {
  sidebar: unknown;
  homeStack: unknown;
}

export const getLayoutPrefsApi = endpoint<{ res: LayoutPrefs }>()({
  method: 'GET',
  path: '/api/preferences/layout',
});

export const setLayoutPrefsApi = endpoint<{ body: LayoutInput; res: LayoutPrefs }>()({
  method: 'PUT',
  path: '/api/preferences/layout',
});

/* ── Presence ─────────────────────────────────────────────────────────────── */

export interface PresencePrefs {
  presenceVisibility: PresenceVisibility;
  presenceDetail: boolean;
}

export const getPresencePrefsApi = endpoint<{ res: PresencePrefs }>()({
  method: 'GET',
  path: '/api/preferences/presence',
});

export const setPresencePrefsApi = endpoint<{
  body: z.infer<typeof presencePrivacySchema>;
  res: PresencePrefs;
}>()({ method: 'PUT', path: '/api/preferences/presence' });

/* ── Muted words ──────────────────────────────────────────────────────────── */

export interface MutedWords {
  words: string[];
  /** `{ word: epochMs }` deadlines. */
  expiries: Record<string, number>;
}

export const getMutedWordsApi = endpoint<{ res: MutedWords }>()({
  method: 'GET',
  path: '/api/preferences/muted-words',
});

export const setMutedWordsApi = endpoint<{
  body: { words: string[]; expiries?: Record<string, number> };
  res: MutedWords;
}>()({ method: 'PUT', path: '/api/preferences/muted-words' });

/* ── Notification preferences (category × channel matrix + quiet hours) ───── */

export interface NotificationMatrixPrefs {
  matrix: NonNullable<z.infer<typeof notifPrefsSchema>['matrix']>;
  quietStart: number | null;
  quietEnd: number | null;
  tz: string | null;
  emailDigest: boolean;
}

export const getNotificationMatrixApi = endpoint<{ res: NotificationMatrixPrefs }>()({
  method: 'GET',
  path: '/api/preferences/notifications',
});

export const setNotificationMatrixApi = endpoint<{
  body: z.infer<typeof notifPrefsSchema>;
  res: NotificationMatrixPrefs;
}>()({ method: 'PUT', path: '/api/preferences/notifications' });

/* ── Notification per-type toggles ────────────────────────────────────────── */

export interface NotificationToggles {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  reposts: boolean;
  system: boolean;
}

export const getNotificationTogglesApi = endpoint<{ res: NotificationToggles }>()({
  method: 'GET',
  path: '/api/notifications/preferences',
});

export const setNotificationTogglesApi = endpoint<{
  body: Partial<NotificationToggles>;
  res: NotificationToggles;
}>()({ method: 'PUT', path: '/api/notifications/preferences' });

/* ── Notifications ────────────────────────────────────────────────────────── */

export interface NotificationRow {
  id: string;
  type: 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW' | 'MENTION' | 'REPOST' | 'SYSTEM';
  entityType: string | null;
  entityId: string | null;
  preview: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    image: string | null;
    handle: string | null;
  } | null;
}

export const listNotificationsApi = endpoint<{
  query: { cursor?: string; limit?: number };
  res: { items: NotificationRow[]; nextCursor: string | null };
}>()({ method: 'GET', path: '/api/notifications' });

export const markNotificationsReadApi = endpoint<{
  body: { all?: boolean; ids?: string[] };
  res: { success: true; updated: number };
}>()({ method: 'POST', path: '/api/notifications/read' });
