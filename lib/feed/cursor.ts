/**
 * Keyset (composite) pagination cursors for the feed.
 *
 * Phase 0 of docs/feed/plan.md replaces the old timestamp-only cursor with a
 * composite `(createdAt, id)` keyset so ties (posts sharing a millisecond)
 * never drop or duplicate rows across pages. The cursor is an opaque,
 * URL-safe base64 token — the client only ever round-trips it.
 */

export interface FeedCursor {
  createdAt: Date;
  id: string;
}

/** Encode a `(createdAt, id)` pair into an opaque, URL-safe cursor token. */
export function encodeCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  const json = JSON.stringify({ t: iso, i: id });
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decode a cursor token. Tolerates the legacy ISO-timestamp cursor (older
 * clients / in-flight requests during deploy) by treating it as a
 * timestamp-only keyset with an empty id tie-break.
 */
export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { t: string; i: string };
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i ?? "" };
  } catch {
    // Legacy cursor: a bare ISO timestamp string.
    const legacy = new Date(raw);
    if (!Number.isNaN(legacy.getTime())) {
      // Tie-break with a maximal id so the boundary row itself is excluded.
      return { createdAt: legacy, id: "￿" };
    }
    return null;
  }
}

/**
 * Prisma `where` fragment selecting rows strictly older than the cursor under
 * a `(createdAt desc, id desc)` ordering:
 *   createdAt < c.createdAt OR (createdAt = c.createdAt AND id < c.id)
 */
export function keysetWhere(cursor: FeedCursor | null): Record<string, unknown> {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
