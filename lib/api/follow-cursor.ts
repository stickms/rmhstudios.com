/**
 * Keyset cursor for the followers / following lists, ordered `(createdAt, id)`
 * descending.
 *
 * The old cursor was the last row's `createdAt` ISO string, paged with
 * `createdAt < cursor`. Rows that share a millisecond (bulk follows, imports)
 * straddling a page boundary were silently dropped. The new cursor is
 * `<iso>_<id>` and breaks ties on `id`. The bare ISO form is still accepted so
 * clients holding an old cursor keep working (they keep the old tie behaviour
 * for that one page).
 */
export type FollowCursor = { createdAt: Date; id: string | null };

export const FOLLOW_ORDER_BY = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

export function encodeFollowCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

export function parseFollowCursor(raw: string | null | undefined): FollowCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf('_');
  const iso = sep === -1 ? raw : raw.slice(0, sep);
  const id = sep === -1 ? null : raw.slice(sep + 1) || null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

/** Prisma `where` fragment selecting rows strictly after the cursor. */
export function followCursorWhere(cursor: FollowCursor | null) {
  if (!cursor) return {};
  if (cursor.id === null) return { createdAt: { lt: cursor.createdAt } };
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  };
}
