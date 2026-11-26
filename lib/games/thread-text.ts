/**
 * `@handle` mentions in a game thread's text (s15-12). Pure: the server reads handles with it to tell people, and the
 * page tokenises a body with it to draw links. Nothing is stored, so a renamed handle simply stops linking and an
 * unknown handle stays plain text.
 *
 * A mention is an `@` that starts the text or follows a character that is neither a word character nor another `@`,
 * then 1 to 30 word characters (the feed's rule, `lib/feed/mentions.ts`). So `sam@example.com` and `@@sam` name nobody.
 */

const MENTION = /(^|[^\w@])@(\w{1,30})/g;

/** Most members one post can tell. */
export const MAX_MENTION_NOTICES = 5;
/** Most distinct handles a page looks up for rendering, across the opening post and every reply shown. */
export const MAX_PAGE_HANDLES = 100;

export type ThreadTextPart =
  | { type: 'text'; text: string }
  | {
      type: 'mention';
      /** The text as written, `@Sam`. */
      raw: string;
      /** The handle as written, `Sam`. */
      handle: string;
    };

/** Where each mention sits in `text`: the index of its `@` and the handle as written. */
function mentionMatches(text: string): { at: number; handle: string }[] {
  const out: { at: number; handle: string }[] = [];
  for (const m of text.matchAll(MENTION)) {
    out.push({ at: (m.index ?? 0) + m[1].length, handle: m[2] });
  }
  return out;
}

/**
 * The unique handles in `text`, in order of first appearance and as written, at most `limit`. Uniqueness ignores case
 * (`@Sam` and `@sam` are one member).
 */
export function mentionedHandles(text: string, limit: number = MAX_MENTION_NOTICES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { handle } of mentionMatches(text)) {
    if (out.length >= limit) break;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(handle);
  }
  return out;
}

/** The unique handles across several texts, as {@link mentionedHandles} does for one. */
export function mentionedHandlesIn(texts: readonly string[], limit: number = MAX_PAGE_HANDLES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    for (const { handle } of mentionMatches(text)) {
      if (out.length >= limit) return out;
      const key = handle.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(handle);
    }
  }
  return out;
}

/**
 * Split `text` into plain text and mentions. Only a handle `isKnown` answers for becomes a mention part; every other
 * `@word` stays inside the text. The parts joined (`raw` for a mention) are always exactly `text`.
 */
export function tokenizeMentions(text: string, isKnown: (handle: string) => boolean): ThreadTextPart[] {
  const parts: ThreadTextPart[] = [];
  let last = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const prev = parts[parts.length - 1];
    if (prev?.type === 'text') prev.text += s;
    else parts.push({ type: 'text', text: s });
  };
  for (const { at, handle } of mentionMatches(text)) {
    if (!isKnown(handle)) continue;
    pushText(text.slice(last, at));
    parts.push({ type: 'mention', raw: `@${handle}`, handle });
    last = at + 1 + handle.length;
  }
  pushText(text.slice(last));
  return parts;
}
