/**
 * @mentions in group chats (s07-05). Pure and client-safe: parsing, who is notified, the composer's `@` trigger and the
 * segments a message row renders. The server half is `mentions.server.ts`.
 */

/** At most this many members are notified by one message; further mentions still highlight. */
export const MAX_NOTIFIED_MENTIONS = 10;

/** A handle is an `@` that starts the text or follows a character that is neither a word character nor `@`, then 1-30 word characters (the feed's rule). */
const HANDLE = /(?:^|[^\w@])@(\w{1,30})/g;
/** URLs are blanked before parsing, so `https://example.com/@bob` mentions nobody. */
const URL_LIKE = /(?:https?:\/\/|www\.)\S+/gi;
/** A bound on how many distinct handles one message is scanned for. */
const MAX_SCANNED = 50;

export interface MentionMember {
  id: string;
  handle: string | null;
}

/** The distinct handles written in `content` (first casing kept), outside URLs, in order of appearance. */
export function mentionHandles(content: string): string[] {
  const text = content.replace(URL_LIKE, (u) => ' '.repeat(u.length));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(HANDLE)) {
    const handle = m[1];
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(handle);
    if (out.length >= MAX_SCANNED) break;
  }
  return out;
}

/**
 * The members a message mentions, in order of appearance, never the sender, each once. `mentioned` is every one (stored
 * and highlighted); `notify` is the first `MAX_NOTIFIED_MENTIONS` of them.
 */
export function mentionTargets(
  content: string,
  members: readonly MentionMember[],
  senderId: string,
): {
  mentioned: string[];
  notify: string[];
} {
  const byHandle = new Map<string, string>();
  for (const m of members) if (m.handle) byHandle.set(m.handle.toLowerCase(), m.id);
  const mentioned: string[] = [];
  for (const handle of mentionHandles(content)) {
    const id = byHandle.get(handle.toLowerCase());
    if (id && id !== senderId && !mentioned.includes(id)) mentioned.push(id);
  }
  return {
    mentioned,
    notify: mentioned.slice(0, MAX_NOTIFIED_MENTIONS),
  };
}

/** What a message row renders: plain text, or a mention of a member. */
export type MentionSegment =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'mention';
      text: string;
      userId: string;
      handle: string;
      me: boolean;
    };

/** Split `content` into text and member mentions (a non-member's `@handle` stays text; URLs are never split). */
export function splitMentions(content: string, members: readonly MentionMember[], viewerId: string): MentionSegment[] {
  const byHandle = new Map<string, MentionMember>();
  for (const m of members) if (m.handle) byHandle.set(m.handle.toLowerCase(), m);
  const masked = content.replace(URL_LIKE, (u) => ' '.repeat(u.length));
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const m of masked.matchAll(HANDLE)) {
    const handle = m[1];
    if (!handle) continue;
    const member = byHandle.get(handle.toLowerCase());
    if (!member) continue;
    // The match may include one leading character; the mention itself is `@handle`.
    const end = (m.index ?? 0) + m[0].length;
    const start = end - handle.length - 1;
    if (start > cursor)
      segments.push({
        kind: 'text',
        text: content.slice(cursor, start),
      });
    segments.push({
      kind: 'mention',
      text: content.slice(start, end),
      userId: member.id,
      handle: member.handle ?? handle,
      me: member.id === viewerId,
    });
    cursor = end;
  }
  if (cursor < content.length)
    segments.push({
      kind: 'text',
      text: content.slice(cursor),
    });
  return segments;
}

/** The `@word` being typed immediately before the caret, or null. */
export function mentionTrigger(
  text: string,
  caret: number,
): {
  query: string;
  start: number;
} | null {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)@(\w{0,30})$/.exec(before);
  if (!m) return null;
  const query = m[1] ?? '';
  return {
    query,
    start: caret - query.length - 1,
  };
}

export interface PickerMember {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

export const PICKER_LIMIT = 8;

/** Members with a handle matching `query`: handle prefix first, then handle or name containing it. The viewer is not offered. */
export function rankMembers(
  members: readonly PickerMember[],
  query: string,
  viewerId: string,
  limit: number = PICKER_LIMIT,
): PickerMember[] {
  const q = query.toLowerCase();
  const prefix: PickerMember[] = [];
  const rest: PickerMember[] = [];
  for (const m of members) {
    if (!m.handle || m.id === viewerId) continue;
    const h = m.handle.toLowerCase();
    if (!q || h.startsWith(q)) prefix.push(m);
    else if (h.includes(q) || (m.name ?? '').toLowerCase().includes(q)) rest.push(m);
  }
  return [...prefix, ...rest].slice(0, limit);
}

/** Put `@handle ` in place of the typed trigger; returns the new draft and caret, or null if it would not fit. */
export function insertMention(
  text: string,
  trigger: {
    query: string;
    start: number;
  },
  handle: string,
  maxLength: number,
): {
  value: string;
  caret: number;
} | null {
  const end = trigger.start + 1 + trigger.query.length;
  const insertion = `@${handle} `;
  const value = text.slice(0, trigger.start) + insertion + text.slice(end);
  if (value.length > maxLength) return null;
  return {
    value,
    caret: trigger.start + insertion.length,
  };
}
