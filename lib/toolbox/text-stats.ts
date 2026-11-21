/**
 * Text statistics: the counts a writer checks against a limit or a deadline.
 *
 * Words and sentences come from `Intl.Segmenter`, so they follow the locale's
 * own rules (a Japanese sentence has no spaces; "U.S." does not end one in
 * English) instead of splitting on spaces and full stops. Characters are
 * grapheme clusters: an emoji with a skin tone is one character, as a reader
 * would count it, while `codeUnits` is what a database column or an SMS limit
 * counts.
 */

/** Silent-reading and speaking rates, words per minute (Brysbaert 2019; typical presentation pace). */
export const READING_WPM = 238;
export const SPEAKING_WPM = 150;

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  codeUnits: number;
  bytes: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  averageWordLength: number;
  longestWord: string;
  readingSeconds: number;
  speakingSeconds: number;
}

export interface WordFrequency {
  word: string;
  count: number;
}

function segmenter(locale: string, granularity: 'grapheme' | 'word' | 'sentence'): Intl.Segmenter {
  try {
    return new Intl.Segmenter(locale, { granularity });
  } catch {
    return new Intl.Segmenter('en', { granularity });
  }
}

/** The word-like segments of `text`, in order. */
export function wordsOf(text: string, locale = 'en'): string[] {
  const out: string[] = [];
  for (const seg of segmenter(locale, 'word').segment(text)) {
    if (seg.isWordLike) out.push(seg.segment);
  }
  return out;
}

function count(iterable: Iterable<unknown>): number {
  let n = 0;
  for (const _ of iterable) n++;
  return n;
}

export function textStats(text: string, locale = 'en'): TextStats {
  const words = wordsOf(text, locale);
  const graphemes = [...segmenter(locale, 'grapheme').segment(text)].map((s) => s.segment);
  const sentences = [...segmenter(locale, 'sentence').segment(text)].filter((s) => /\p{L}|\p{N}/u.test(s.segment));
  const trimmed = text.trim();
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const letters = words.reduce((sum, w) => sum + count(segmenter(locale, 'grapheme').segment(w)), 0);
  const longestWord = words.reduce((best, w) => (w.length > best.length ? w : best), '');
  return {
    characters: graphemes.length,
    charactersNoSpaces: graphemes.filter((g) => !/^\s+$/u.test(g)).length,
    codeUnits: text.length,
    bytes: new TextEncoder().encode(text).length,
    words: words.length,
    sentences: sentences.length,
    paragraphs,
    lines,
    averageWordLength: words.length ? letters / words.length : 0,
    longestWord,
    readingSeconds: Math.ceil((words.length / READING_WPM) * 60),
    speakingSeconds: Math.ceil((words.length / SPEAKING_WPM) * 60),
  };
}

/**
 * The most frequent words, case-folded for the locale. Numbers are skipped, and so
 * are words shorter than `minLength` (the usual way to drop "a", "of", "the"
 * without a per-language stop list).
 */
export function topWords(text: string, { locale = 'en', minLength = 4, limit = 10 } = {}): WordFrequency[] {
  const counts = new Map<string, number>();
  for (const word of wordsOf(text, locale)) {
    if (/^\p{N}+$/u.test(word)) continue;
    const key = word.toLocaleLowerCase(locale);
    if ([...key].length < minLength) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, n]) => ({ word, count: n }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, locale))
    .slice(0, limit);
}

/** `m:ss` for a duration in seconds (or `h:mm:ss` past an hour). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}
