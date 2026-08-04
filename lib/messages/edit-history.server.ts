/**
 * Prior revisions of an edited direct message, retained for the moderation
 * window and exposed to neither participant.
 *
 * ## Why this exists
 *
 * Posts already work this way: `RMHarkEdit` snapshots the previous body before
 * `RMHark.content` is overwritten (`app/routes/api/rmharks/$id.ts`), so an edit
 * is a new version rather than a silent rewrite. A DM edit needs the same
 * property for the same reason — otherwise "edit" is a way to make a report
 * describe text that no longer exists anywhere.
 *
 * ## Why it is not a table (and what that costs)
 *
 * There is no `DirectMessageEdit` model, and this change was not permitted to
 * add one. So the snapshot lands in the Redis backplane with a TTL equal to the
 * moderation window, falling back to a bounded in-process map when Redis is not
 * configured (local dev, single instance).
 *
 * That is honestly weaker than `RMHarkEdit`:
 *
 * - Redis is optional, so on a deployment without it the retention is
 *   per-process and dies with the process.
 * - A TTL is not an audit log — it expires on its own rather than being purged
 *   with the message.
 *
 * It is enough to answer "what did this say when it was reported?" inside the
 * window, which is the case that matters, and it never returns anything to a
 * participant — the only reader is a moderator path. **The follow-up is a
 * `DirectMessageEdit` table shaped exactly like `RMHarkEdit`**; when it lands,
 * `recordPriorRevision` becomes an insert and this file goes away.
 */

import { redisEnabled, redisGetJSON, redisSetJSON } from '@/lib/redis.server';

/** How long a prior revision stays readable. Matches the moderation window. */
export const EDIT_HISTORY_TTL_MS = 30 * 24 * 60 * 60_000;

/** Revisions kept per message — an edit war does not get unbounded storage. */
const MAX_REVISIONS = 10;

/** Cap on messages tracked by the in-process fallback (~a few hundred KB). */
const MAX_TRACKED_MESSAGES = 2000;

export interface PriorRevision {
  content: string;
  /** When this text was replaced. */
  replacedAt: string;
}

const historyKey = (messageId: string) => `dm:edits:${messageId}`;

/**
 * Fallback store. A `Map` iterated in insertion order, trimmed from the front —
 * the oldest tracked message is evicted first, which is also the one most likely
 * to be past its window.
 */
const localHistory = new Map<string, PriorRevision[]>();

function localGet(messageId: string): PriorRevision[] {
  return localHistory.get(messageId) ?? [];
}

function localSet(messageId: string, revisions: PriorRevision[]): void {
  localHistory.delete(messageId);
  localHistory.set(messageId, revisions);
  while (localHistory.size > MAX_TRACKED_MESSAGES) {
    const oldest = localHistory.keys().next();
    if (oldest.done) break;
    localHistory.delete(oldest.value);
  }
}

/**
 * Snapshot the text a message had *before* an edit overwrites it.
 *
 * Best-effort by construction: a failure here must never block the edit itself,
 * because refusing to let someone fix a typo when Redis is down is a worse
 * outcome than a missing revision. Callers do not await the result for
 * correctness — only for ordering in tests.
 */
export async function recordPriorRevision(
  messageId: string,
  content: string,
  now: Date = new Date(),
): Promise<void> {
  const revision: PriorRevision = { content, replacedAt: now.toISOString() };
  try {
    if (redisEnabled()) {
      const existing = (await redisGetJSON<PriorRevision[]>(historyKey(messageId))) ?? [];
      const next = [...existing, revision].slice(-MAX_REVISIONS);
      await redisSetJSON(historyKey(messageId), next, EDIT_HISTORY_TTL_MS);
      return;
    }
  } catch {
    /* fall through to the in-process store */
  }
  localSet(messageId, [...localGet(messageId), revision].slice(-MAX_REVISIONS));
}

/**
 * Read the retained revisions. **Moderation paths only** — this is never part of
 * a participant-facing payload, which is the entire reason the edit marker says
 * only "edited" and not "edited from X".
 */
export async function readPriorRevisions(messageId: string): Promise<PriorRevision[]> {
  try {
    if (redisEnabled()) {
      return (await redisGetJSON<PriorRevision[]>(historyKey(messageId))) ?? [];
    }
  } catch {
    /* fall through */
  }
  return localGet(messageId);
}

/** Test seam — drops the in-process fallback. */
export function __resetEditHistory(): void {
  localHistory.clear();
}
