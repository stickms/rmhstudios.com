/**
 * Paging a market's comments (s15-05): newest first, on the `(createdAt, id)` pair. Prisma's own `cursor` option skips
 * every row that shares the cursor row's `createdAt`, so the pair travels as one string and the server compares it
 * with an `OR`. Pure and client-safe.
 */

/** Comments per page ("Show earlier comments" loads the next one). */
export const COMMENT_PAGE_SIZE = 20;

export interface CommentCursor {
  createdAt: Date;
  id: string;
}

/** `<epoch ms>.<id>`; a comment id is a cuid, which never holds a dot. */
export function encodeCommentCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.getTime()}.${row.id}`;
}

/** The pair a cursor names, or null for anything that is not one (the route answers a bad cursor with the first page). */
export function decodeCommentCursor(cursor: string | undefined | null): CommentCursor | null {
  if (!cursor) return null;
  const dot = cursor.indexOf('.');
  if (dot < 1 || dot === cursor.length - 1) return null;
  const ms = Number(cursor.slice(0, dot));
  const id = cursor.slice(dot + 1);
  if (!Number.isSafeInteger(ms) || ms < 0) return null;
  const createdAt = new Date(ms);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}
