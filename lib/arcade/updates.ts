/**
 * Game updates, the pure half: the page cursor, the notification wording and the entity names the inbox keys on.
 * Client-safe. The reads and writes are `updates.server.ts`.
 */

/** Patch notes per page on the updates page. */
export const UPDATES_PAGE_SIZE = 20;
/** Followers read per batch of the fan-out. */
export const FANOUT_BATCH = 1000;

/** The notification `entityType` of a new patch note and of a newly published guide. */
export const GAME_UPDATE_ENTITY = 'game_update';
export const GAME_GUIDE_ENTITY = 'game_guide';

export interface UpdatesCursor {
  /** `createdAt` of the last note of the previous page, in milliseconds. */
  at: number;
  /** Its id, which breaks a tie between two notes written in the same millisecond. */
  id: string;
}

export function encodeUpdatesCursor(note: { createdAt: Date; id: string }): string {
  return `${note.createdAt.getTime()}_${note.id}`;
}

/** The cursor a client sent back, or null for anything that is not one (the first page then). */
export function decodeUpdatesCursor(raw: string | undefined | null): UpdatesCursor | null {
  if (!raw) return null;
  const at = /^(\d{1,15})_([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!at) return null;
  const ms = Number(at[1]);
  if (!Number.isSafeInteger(ms)) return null;
  return {
    at: ms,
    id: at[2]!,
  };
}

/**
 * Cut one page out of rows read `UPDATES_PAGE_SIZE + 1` at a time (newest first): the page and the cursor of the
 * next one, or null when this was the last.
 */
export function pageOf<
  T extends {
    createdAt: Date;
    id: string;
  },
>(
  rows: readonly T[],
  size: number = UPDATES_PAGE_SIZE,
): {
  items: T[];
  nextCursor: string | null;
} {
  const items = rows.slice(0, size);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > size && last ? encodeUpdatesCursor(last) : null,
  };
}

/** "<Game> updated to <version>: <title>" */
export function gameUpdatePreview(game: string, version: string, title: string): string {
  return `${game} updated to ${version}: ${title}`;
}

/** "New guide for <Game>: <title>" */
export function gameGuidePreview(game: string, title: string): string {
  return `New guide for ${game}: ${title}`;
}

/** Where a notification of either kind leads. */
export function gameUpdateLink(gameId: string): string {
  return `/games/${gameId}/updates`;
}
export function gameGuideLink(gameId: string, guideId: string): string {
  return `/games/${gameId}/guides/${guideId}`;
}

/** The game a `game_update` / `game_guide` notification's link points at, or null for any other link. */
export function gameIdOfLink(link: string | null | undefined): string | null {
  const m = link ? /^\/games\/([A-Za-z0-9_-]{1,64})\/(?:updates|guides\/)/.exec(link) : null;
  return m ? m[1]! : null;
}

/** One patch note as the updates page and the admin list show it. */
export interface PatchNoteItem {
  id: string;
  version: string;
  title: string;
  body: string;
  createdAt: string;
}

/** What a fan-out job carries. */
export type FanoutJob =
  | {
      kind: 'update';
      gameId: string;
      noteId: string;
    }
  | {
      kind: 'guide';
      gameId: string;
      guideId: string;
    };
