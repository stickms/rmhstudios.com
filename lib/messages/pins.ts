/**
 * Pinned direct conversations (s14-12). Pure: the limit, the scope key, the "muted" mark and the merge of the pinned
 * rows with a page of the rest. The reads and the write under the lock are in `pins.server.ts`.
 */

/** A member pins at most this many direct conversations. */
export const CONVERSATION_PIN_LIMIT = 5;

const DM_PREFIX = 'dm:';

/** The `ConversationPref` scope key of a direct conversation (the chat id behind `dm:`). */
export function dmScopeKey(chatId: string): string {
  return `${DM_PREFIX}${chatId}`;
}

/** The chat id of a `dm:<id>` scope key, or null for any other scope. */
export function chatIdOfDmScope(scopeKey: string): string | null {
  return scopeKey.startsWith(DM_PREFIX) && scopeKey.length > DM_PREFIX.length ? scopeKey.slice(DM_PREFIX.length) : null;
}

/** The slice of a stored preference the list marks need. */
export interface PinMuteState {
  muteUntil: Date | null;
  mentionsOnly: boolean;
  pinned: boolean;
}

/** A conversation is "Muted" while a mute is in force, or while only mentions notify. An expired mute is not one. */
export function isMutedMark(
  pref: Pick<PinMuteState, 'muteUntil' | 'mentionsOnly'> | null | undefined,
  now = new Date(),
): boolean {
  if (!pref) return false;
  if (pref.muteUntil && pref.muteUntil.getTime() > now.getTime()) return true;
  return pref.mentionsOnly;
}

/** The two flags a row carries. No preference row is neither. */
export function marksOf(pref: PinMuteState | null | undefined, now = new Date()): { pinned: boolean; muted: boolean } {
  return { pinned: pref?.pinned === true, muted: isMutedMark(pref, now) };
}

/**
 * The first page of the default view: the pinned rows (newest message first), then the paged rest. A row in both
 * appears once, in the pinned block, so a page never repeats a pinned conversation.
 */
export function mergePinnedFirst<T extends { id: string; lastMessageAt: string }>(
  pinned: readonly T[],
  page: readonly T[],
): T[] {
  const head = [...pinned].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt) || (a.id < b.id ? -1 : 1));
  const seen = new Set(head.map((row) => row.id));
  return [...head, ...page.filter((row) => !seen.has(row.id))];
}

/** Fired on `window` after a pin changes, so a Messages list beside the open conversation fetches page one again. */
export const CONVERSATION_PINS_CHANGED_EVENT = 'rmh:conversation-pins-changed';
