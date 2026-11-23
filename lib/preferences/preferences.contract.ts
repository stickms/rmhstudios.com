/**
 * Contracts for /api/preferences/** and /api/notifications/** (redesign audit
 * C1, batch 2). Client-safe: request types come from the zod schemas by
 * `import type`, so no zod ships to the client.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AppearanceComfortInput } from '@/lib/appearance/prefs-schema';
import type { layoutPrefsSchema } from '@/lib/home-widgets-schema';
import type { NotificationFilter } from '@/lib/notifications/filters';
import type { notifPrefsSchema } from '@/lib/notify/categories-schema';
import type { PresenceVisibility } from '@/lib/presence-types';
import type { presencePrivacySchema } from '@/lib/presence-types-schema';
import type { EmailPrefs } from '@/lib/email/preferences';
import type { EmailPrefsInput } from '@/lib/email/preferences-schema';

/* ── Appearance ───────────────────────────────────────────────────────────── */

/** The saved row; nulls mean "use the default". */
export interface AppearancePrefs {
  style: string | null;
  fontScale: number | null;
  density: string | null;
  readableFont: boolean;
  colorVision: string | null;
  jellyMotion: string | null;
  /** The reader's fonts (lib/appearance/fonts.ts); null = never chosen. */
  fontMain: string | null;
  fontReading: string | null;
  fontMono: string | null;
  /** ISO time of the account's last appearance change; null when there is no row. */
  updatedAt: string | null;
}

/** Partial upsert: a field left out is unchanged, an explicit null clears it. */
export type AppearancePrefsInput = {
  style?: string | null;
} & AppearanceComfortInput;

export const getAppearancePrefsApi = endpoint<{
  res: AppearancePrefs;
}>()({
  method: 'GET',
  path: '/api/preferences/appearance',
});

export const setAppearancePrefsApi = endpoint<{
  body: AppearancePrefsInput;
  res: AppearancePrefs;
}>()({
  method: 'PUT',
  path: '/api/preferences/appearance',
});

/* ── Layout ───────────────────────────────────────────────────────────────── */

type LayoutInput = z.infer<typeof layoutPrefsSchema>;

/** Normalised layout (unknown ids dropped) — `parseLayoutPref`'s output. */
export interface LayoutPrefs {
  sidebar: unknown;
  homeStack: unknown;
}

export const getLayoutPrefsApi = endpoint<{
  res: LayoutPrefs;
}>()({
  method: 'GET',
  path: '/api/preferences/layout',
});

export const setLayoutPrefsApi = endpoint<{
  body: LayoutInput;
  res: LayoutPrefs;
}>()({
  method: 'PUT',
  path: '/api/preferences/layout',
});

/* ── Presence ─────────────────────────────────────────────────────────────── */

export interface PresencePrefs {
  presenceVisibility: PresenceVisibility;
  presenceDetail: boolean;
}

export const getPresencePrefsApi = endpoint<{
  res: PresencePrefs;
}>()({
  method: 'GET',
  path: '/api/preferences/presence',
});

export const setPresencePrefsApi = endpoint<{
  body: z.infer<typeof presencePrivacySchema>;
  res: PresencePrefs;
}>()({
  method: 'PUT',
  path: '/api/preferences/presence',
});

/* ── Muted words ──────────────────────────────────────────────────────────── */

export interface MutedWords {
  words: string[];
  /** `{ word: epochMs }` deadlines. */
  expiries: Record<string, number>;
}

export const getMutedWordsApi = endpoint<{
  res: MutedWords;
}>()({
  method: 'GET',
  path: '/api/preferences/muted-words',
});

export const setMutedWordsApi = endpoint<{
  body: {
    words: string[];
    expiries?: Record<string, number>;
  };
  res: MutedWords;
}>()({
  method: 'PUT',
  path: '/api/preferences/muted-words',
});

/* ── Notification preferences (category × channel matrix + quiet hours) ───── */

export interface NotificationMatrixPrefs {
  matrix: NonNullable<z.infer<typeof notifPrefsSchema>['matrix']>;
  quietStart: number | null;
  quietEnd: number | null;
  tz: string | null;
  emailDigest: boolean;
}

export const getNotificationMatrixApi = endpoint<{
  res: NotificationMatrixPrefs;
}>()({
  method: 'GET',
  path: '/api/preferences/notifications',
});

export const setNotificationMatrixApi = endpoint<{
  body: z.infer<typeof notifPrefsSchema>;
  res: NotificationMatrixPrefs;
}>()({
  method: 'PUT',
  path: '/api/preferences/notifications',
});

/* ── Notification per-type toggles ────────────────────────────────────────── */

export interface NotificationToggles {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  reposts: boolean;
  system: boolean;
}

export const getNotificationTogglesApi = endpoint<{
  res: NotificationToggles;
}>()({
  method: 'GET',
  path: '/api/notifications/preferences',
});

export const setNotificationTogglesApi = endpoint<{
  body: Partial<NotificationToggles>;
  res: NotificationToggles;
}>()({
  method: 'PUT',
  path: '/api/notifications/preferences',
});

/* ── Notifications ────────────────────────────────────────────────────────── */

export interface NotificationRow {
  id: string;
  type: 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW' | 'MENTION' | 'REPOST' | 'SYSTEM';
  entityType: string | null;
  entityId: string | null;
  preview: string | null;
  /** A site-written notice's translation key and params (`lib/notifications/notice-keys.ts`); absent on old rows. */
  previewKey?: string | null;
  previewParams?: unknown;
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
  query: {
    cursor?: string;
    limit?: number;
    /** Only this filter's types (`lib/notifications/filters.ts`). */
    filter?: NotificationFilter;
    /** The Unread view: rows unread now, plus those named in `unreadIds`. */
    unread?: 'true';
    /** Comma-separated notification ids (the Unread view's snapshot, at most 100). */
    unreadIds?: string;
  };
  res: {
    items: NotificationRow[];
    nextCursor: string | null;
  };
}>()({
  method: 'GET',
  path: '/api/notifications',
});

export const markNotificationsReadApi = endpoint<{
  body: {
    all?: boolean;
    ids?: string[];
    /** With `all`: only this filter's types. */
    filter?: NotificationFilter;
    /** With `ids`: false marks them unread instead (default true). */
    read?: boolean;
  };
  res: {
    success: true;
    updated: number;
  };
}>()({
  method: 'POST',
  path: '/api/notifications/read',
});

/* ── Email ────────────────────────────────────────────────────────────────── */

/** GET — the caller's effective email preferences (defaults filled in). */
export const getEmailPrefsApi = endpoint<{
  res: EmailPrefs;
}>()({
  method: 'GET',
  path: '/api/preferences/email',
});

/** PUT — partial update; a category left out is unchanged. */
export const setEmailPrefsApi = endpoint<{
  body: EmailPrefsInput;
  res: EmailPrefs;
}>()({
  method: 'PUT',
  path: '/api/preferences/email',
});
