/**
 * Import/export for the muted-words list. Pure so the panel and the tests share
 * one definition of what a file may contain.
 *
 * Export is one word per line. Import is forgiving: it accepts that format, a
 * comma/semicolon separated list, or a JSON array of strings, and normalizes
 * every entry the same way the API does (trim, lowercase, 50-character cap,
 * de-duplicated).
 */

export const MAX_MUTED_WORDS = 100;
export const MAX_MUTED_WORD_LEN = 50;

/** The file contents for downloading `words`. */
export function serializeMutedWords(words: string[]): string {
  return words.join('\n') + (words.length ? '\n' : '');
}

function splitEntries(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      // Not JSON after all — fall through to plain-text splitting.
    }
  }
  return trimmed.split(/[\n\r,;]+/);
}

/**
 * Merge an imported file into the current list. Returns the new list (existing
 * words first, then new ones, capped at {@link MAX_MUTED_WORDS}) and how many
 * words were actually added.
 */
export function mergeImportedWords(
  current: string[],
  fileText: string,
): { words: string[]; added: number } {
  const seen = new Set(current);
  const words = [...current];
  let added = 0;
  for (const raw of splitEntries(fileText)) {
    if (words.length >= MAX_MUTED_WORDS) break;
    const w = raw.trim().toLowerCase().slice(0, MAX_MUTED_WORD_LEN);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    words.push(w);
    added++;
  }
  return { words, added };
}
