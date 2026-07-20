/**
 * Rich presence & Friends rail (§9) — client-safe activity vocabulary and
 * visibility types. Shared by the presence server, the /api/friends/active
 * payload, the rail/sheet/ActivityLine UI, and the privacy settings. No server
 * imports.
 *
 * Activity is set **server-side only** by the surfaces the user is in (never
 * client-asserted) and lives in the ephemeral presence store (expires with the
 * heartbeat) — so it self-clears on disconnect/crash with no new table.
 */
import { z } from 'zod';

/** What a friend is doing right now, if anything. `label` is precomputed for display. */
export type PresenceActivity =
  | { kind: 'game'; gameId: string; label: string }
  | { kind: 'music_room'; roomId: string; label: string }
  | { kind: 'tube_room'; roomId: string; label: string }
  | { kind: 'space'; spaceId: string; label: string };

export type PresenceActivityKind = PresenceActivity['kind'];

/** A one-tap context target derived from an activity (join party / hop in / watch). */
export interface JoinTarget {
  kind: PresenceActivityKind;
  /** The id to route to (gameId / roomId / spaceId). */
  id: string;
  /** Resolved href for the context button. */
  href: string;
}

/** Who is allowed to see this user in a rail / activity line. */
export const PRESENCE_VISIBILITIES = ['mutuals', 'followers', 'nobody'] as const;
export type PresenceVisibility = (typeof PRESENCE_VISIBILITIES)[number];
export const DEFAULT_PRESENCE_VISIBILITY: PresenceVisibility = 'mutuals';

/** One entry in the Friends rail / sheet. */
export interface ActiveFriend {
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    username: string | null;
    image: string | null;
  };
  /** Null when the viewer isn't allowed activity detail, or the friend is idle. */
  activity: PresenceActivity | null;
  /** Present only when the activity is joinable. */
  joinable: JoinTarget | null;
}

/** zod for the presence-privacy PUT (settings → privacy). */
export const presencePrivacySchema = z.object({
  presenceVisibility: z.enum(PRESENCE_VISIBILITIES).optional(),
  presenceDetail: z.boolean().optional(),
});
export type PresencePrivacyInput = z.infer<typeof presencePrivacySchema>;

/** Resolve the joinable href for an activity, or null when it isn't joinable. */
export function joinTargetFor(activity: PresenceActivity | null): JoinTarget | null {
  if (!activity) return null;
  switch (activity.kind) {
    case 'game':
      return { kind: 'game', id: activity.gameId, href: `/arcade/${activity.gameId}` };
    case 'music_room':
      return { kind: 'music_room', id: activity.roomId, href: `/rmhmusic/${activity.roomId}` };
    case 'tube_room':
      return { kind: 'tube_room', id: activity.roomId, href: `/rmhtube/${activity.roomId}` };
    case 'space':
      return { kind: 'space', id: activity.spaceId, href: `/spaces/${activity.spaceId}` };
    default:
      return null;
  }
}

/** The context-button verb for an activity kind (English fallback; i18n key `context-<kind>`). */
export function contextVerb(kind: PresenceActivityKind): string {
  switch (kind) {
    case 'game':
      return 'Join';
    case 'space':
      return 'Hop in';
    case 'music_room':
    case 'tube_room':
      return 'Watch';
    default:
      return 'Open';
  }
}
