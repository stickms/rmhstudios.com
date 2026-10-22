/**
 * Readability meter for long-form drafts — pure and client-safe.
 * Feature idea L4 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * The Hemingway editor's useful core, for the blog, news and community-page
 * editors: reading time, a grade level, and the specific sentences that are
 * hard to read — because "grade 14" is a verdict and "these three sentences
 * are 45 words long" is something an author can act on.
 *
 * Flesch–Kincaid grade level is English-only by construction (its syllable
 * model is English). For any other locale the meter reports reading time and
 * long sentences only, and hides the grade rather than showing a wrong one.
 * Reading time uses 238 wpm (Brysbaert 2019's silent-reading mean for
 * non-fiction), rounded up to whole minutes with a 1-minute floor.
 */

export interface Readability {
  words: number;
  sentences: number;
  minutes: number;
  /** Flesch–Kincaid grade; null outside English. */
  grade: number | null;
  /** Sentences of at least LONG_SENTENCE words, with their offsets. */
  longSentences: Array<{ start: number; end: number; words: number }>;
  /** Share of words with 3+ syllables (English only, else null). */
  complexWordShare: number | null;
}

const WPM = 238;
export const LONG_SENTENCE = 30;

/** Strip Markdown syntax that is not prose: code, links' URLs, images, markup. */
export function proseOf(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, ' ');
}

/** Heuristic English syllable count — good to ±1 on most words. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function measure(markdown: string, locale = 'en'): Readability {
  const text = proseOf(markdown);
  const english = locale === 'en' || locale.startsWith('en-');

  const longSentences: Readability['longSentences'] = [];
  let sentences = 0;
  let words = 0;
  let syl = 0;
  let complex = 0;

  for (const m of text.matchAll(/[^.!?\n]+(?:[.!?]+|\n|$)/g)) {
    const ws = m[0].match(WORD) ?? [];
    if (ws.length === 0) continue;
    sentences++;
    words += ws.length;
    if (english) {
      for (const w of ws) {
        const s = syllables(w);
        syl += s;
        if (s >= 3) complex++;
      }
    }
    if (ws.length >= LONG_SENTENCE) {
      longSentences.push({ start: m.index, end: m.index + m[0].length, words: ws.length });
    }
  }

  const grade =
    english && words > 0 && sentences > 0
      ? Math.max(
          0,
          Math.round((0.39 * (words / sentences) + 11.8 * (syl / words) - 15.59) * 10) / 10,
        )
      : null;

  return {
    words,
    sentences,
    minutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WPM)),
    grade,
    longSentences,
    complexWordShare: english && words > 0 ? complex / words : null,
  };
}
