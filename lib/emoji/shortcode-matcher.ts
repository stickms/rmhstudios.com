import type { ShortcodeMap } from './shortcodes';

export interface ShortcodeTrigger {
  query: string;
  /** Index of the ':' in the text. */
  start: number;
}

// A ':' that starts the string or follows whitespace/open bracket, then 2+
// shortcode chars up to the caret. The boundary requirement keeps times
// (10:30) and URLs (https://) from triggering.
const TRIGGER_REGEX = /(?:^|[\s([{]):([a-z0-9_+-]{2,})$/i;
const COMPLETED_REGEX = /(?:^|[\s([{]):([a-z0-9_+-]+):$/i;

export function findShortcodeTrigger(text: string, caret: number): ShortcodeTrigger | null {
  const before = text.slice(0, caret);
  const match = before.match(TRIGGER_REGEX);
  if (!match) return null;
  const query = match[1].toLowerCase();
  return { query, start: caret - query.length - 1 };
}

export function searchShortcodes(
  query: string,
  map: ShortcodeMap,
  limit = 8,
): Array<{ name: string; emoji: string }> {
  const q = query.toLowerCase();
  const hits: Array<{ name: string; emoji: string; isPrefix: boolean }> = [];
  for (const [name, emoji] of Object.entries(map)) {
    if (name.includes(q)) hits.push({ name, emoji, isPrefix: name.startsWith(q) });
  }
  hits.sort(
    (a, b) => Number(b.isPrefix) - Number(a.isPrefix) || a.name.length - b.name.length,
  );
  const seen = new Set<string>();
  const results: Array<{ name: string; emoji: string }> = [];
  for (const hit of hits) {
    if (seen.has(hit.emoji)) continue;
    seen.add(hit.emoji);
    results.push({ name: hit.name, emoji: hit.emoji });
    if (results.length >= limit) break;
  }
  return results;
}

export function replaceCompletedShortcode(
  text: string,
  caret: number,
  map: ShortcodeMap,
): { next: string; caret: number } | null {
  const before = text.slice(0, caret);
  const match = before.match(COMPLETED_REGEX);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const emoji = map[name];
  if (!emoji) return null;
  const start = caret - name.length - 2; // ':' + name + ':'
  const next = text.slice(0, start) + emoji + text.slice(caret);
  return { next, caret: start + emoji.length };
}
