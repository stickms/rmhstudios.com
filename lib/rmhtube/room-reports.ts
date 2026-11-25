/**
 * Reports of an RMHTube room or watch party (s14-10) — the pure half: nothing here touches a database, so the hub's
 * relative imports, the web tier and the tests all read the same rules.
 *
 * A report is filed against the room code. A moderator's takedown stamps `moderatedAt` and `closedAt` on the room
 * (`room-reports.server.ts`); every reader of rooms then leaves it out (`TUBE_ROOM_READ_PATHS`).
 */

const DAY_MS = 86_400_000;

/** How long a removed room's name stays unusable for the same host. */
export const ROOM_NAME_REMOVED_DAYS = 30;
export const ROOM_NAME_REMOVED_MS = ROOM_NAME_REMOVED_DAYS * DAY_MS;

/** The moderator's preview shows this much of a room's description. */
export const ROOM_PREVIEW_DESCRIPTION_MAX = 280;

/** The longest room name the hub stores (`sanitizeString(name, 64)`). */
export const ROOM_NAME_COMPARE_MAX = 64;

/**
 * A name as it is compared for "the same name". Both sides of every comparison go through this, so a name stored by
 * the web tier (up to 80 characters, markup characters kept) and one stored by the hub (stripped of `<>&"'` and cut
 * to 64) meet on the same key: trim, strip those characters, cut to 64, trim again, lower-case. An empty name is
 * never a removed name.
 */
export function normalizeRoomName(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/[<>&"']/g, '')
    .slice(0, ROOM_NAME_COMPARE_MAX)
    .trim()
    .toLowerCase();
}

/** The earliest `moderatedAt` that still blocks a name, as of `now`. */
export function removedNameSince(now: Date): Date {
  return new Date(now.getTime() - ROOM_NAME_REMOVED_MS);
}

/** Whether `name` equals one of the host's recently removed room names. */
export function isRemovedRoomName(name: string | null | undefined, removedNames: readonly (string | null)[]): boolean {
  const wanted = normalizeRoomName(name);
  if (!wanted) return false;
  return removedNames.some((removed) => normalizeRoomName(removed) === wanted);
}

export interface RoomPreviewInput {
  id: string;
  name: string | null;
  description: string | null;
  isPublic: boolean;
  scheduledFor: Date | null;
  hostName: string | null;
  hostId: string;
}

/** The one line a moderator reads for a reported room: its name, description, host, visibility and time. */
export function roomPreviewLine(room: RoomPreviewInput): string {
  const name = room.name?.trim() || `Room ${room.id}`;
  const description = room.description?.trim();
  const clipped =
    description && description.length > ROOM_PREVIEW_DESCRIPTION_MAX
      ? `${description.slice(0, ROOM_PREVIEW_DESCRIPTION_MAX - 1)}…`
      : description;
  const when = room.scheduledFor
    ? room.scheduledFor.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : 'not scheduled';
  const parts = [
    `${name} (${room.id})`,
    `host ${room.hostName?.trim() || room.hostId}`,
    room.isPublic ? 'public' : 'private',
    when,
  ];
  return clipped ? `${parts.join(' · ')}: ${clipped}` : parts.join(' · ');
}

/**
 * Every server path that reads rooms to show them (or to start them) and so must leave a moderated room out.
 * `room-read-paths.test.ts` strips comments and checks each entry for real use:
 *
 * - `filter`: the file's own queries carry `moderatedAt` (`moderatedAt: null`).
 * - `delegates`: the file reads rooms only through the named functions of a `filter` file, which it must import.
 * - `closed`: the file reads `closedAt: null` and relies on the takedown always stamping it (the takedown test holds
 *   that), so a moderated room is closed to it.
 */
export type TubeRoomReadPath =
  | { file: string; reads: string; how: 'filter' }
  | { file: string; reads: string; how: 'delegates'; from: string; functions: readonly string[] }
  | { file: string; reads: string; how: 'closed' };

export const TUBE_ROOM_READ_PATHS: readonly TubeRoomReadPath[] = [
  {
    file: 'lib/rmhtube/parties.server.ts',
    reads:
      'the landing and upcoming list (listUpcoming), the party page (getParty), the calendar file (partyForCalendar)',
    how: 'filter',
  },
  {
    file: 'server/rmhtube/room-manager.ts',
    reads: 'the hub loading a room on join (loadRoomFromDb) and restoring rooms at start (restoreRoomsFromDb)',
    how: 'filter',
  },
  {
    file: 'lib/api/v1/rmhtube.server.ts',
    reads: "the developer API's rmhtube/parties list, party and going",
    how: 'delegates',
    from: 'lib/rmhtube/parties.server.ts',
    functions: ['listUpcoming', 'getParty'],
  },
  {
    file: 'lib/rmhtube/api/rmhtube.parties.server.ts',
    reads: 'GET /api/rmhtube/parties (the landing list)',
    how: 'delegates',
    from: 'lib/rmhtube/parties.server.ts',
    functions: ['listUpcoming'],
  },
  {
    file: 'lib/rmhtube/api/rmhtube.parties.$roomId.server.ts',
    reads: 'GET /api/rmhtube/parties/$roomId (the party page)',
    how: 'delegates',
    from: 'lib/rmhtube/parties.server.ts',
    functions: ['getParty'],
  },
  {
    file: 'app/routes/api/rmhtube/parties/$roomId/ics.ts',
    reads: 'the calendar download of a party',
    how: 'delegates',
    from: 'lib/rmhtube/parties.server.ts',
    functions: ['partyForCalendar'],
  },
  {
    file: 'lib/rmhtube/subscriptions.server.ts',
    reads: "the fan-out that tells a host's subscribers about a new public party",
    how: 'closed',
  },
];
