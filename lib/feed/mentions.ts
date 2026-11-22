/**
 * Extract the `@handle` mentions from a block of user text.
 *
 * Mirrors the client autocomplete's token rules: a handle is an `@` that starts
 * the string or follows a non-word character, then 1–30 word characters. Returns
 * the unique handles (original casing preserved, deduped case-insensitively),
 * capped so a single post can't fan out an unbounded number of notifications.
 */
const MENTION_REGEX = /(?:^|[^\w@])@(\w{1,30})/g;
const MAX_MENTIONS = 10;

export function parseHandles(text: string): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];
  for (const match of text.matchAll(MENTION_REGEX)) {
    const handle = match[1];
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    handles.push(handle);
    if (handles.length >= MAX_MENTIONS) break;
  }
  return handles;
}
