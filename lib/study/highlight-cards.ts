/**
 * Cards from reading highlights (s10-01), pure: no I/O, no React. A highlight's passage becomes one of two shapes:
 * "Question and passage" (a basic card: the member's front, the passage as the back, then the document's title) or
 * "Fill in the blank" (a cloze card: the passage with one to five words blanked). The card text is always a substring
 * of the highlight, trimmed and never rewritten, so a card never says something the source did not. The server runs
 * these same functions on the passage it reads from the row; the dialog runs them to show the count and the picker.
 */
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';

/** Highlights one "Make cards" step-through may carry. */
export const MAX_HIGHLIGHT_CARD_BATCH = 50;
/** Words (or phrases) one fill-in-the-blank card may blank. */
export const MAX_CLOZE_DELETIONS = 5;
/** A highlight's stored passage is at most this long (`ReadingHighlight.exact`). */
export const HIGHLIGHT_EXACT_MAX = 2000;

export const CARD_SHAPES = ['basic', 'cloze'] as const;
export type CardShape = (typeof CARD_SHAPES)[number];

/** A run of selected words, as inclusive indices into `splitWords(passage)`. */
export interface WordRange {
  from: number;
  to: number;
}

/** One request item. The passage is a trimmed part of the highlight; the server checks it against the stored row. */
export type HighlightCardItem =
  | { highlightId: string; shape: 'basic'; text: string; front: string }
  | { highlightId: string; shape: 'cloze'; text: string; deletions: WordRange[] };

/** What a draft needs, in the deck editor's card vocabulary. */
export interface HighlightCardDraft {
  kind: CardShape;
  front: string;
  back: string;
}

export type HighlightCardError =
  | 'passage-empty'
  | 'not-in-highlight'
  | 'passage-too-long'
  | 'front-required'
  | 'front-too-long'
  | 'no-blanks'
  | 'too-many-blanks'
  | 'unsafe-text'
  | 'cloze-too-long';

/* --------------------------------- words ---------------------------------- */

/** A whitespace-separated word of a passage. `coreStart`/`coreEnd` bound its letters and digits, so punctuation stays outside a blank. */
export interface Word {
  text: string;
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  /** False for a token with no letter or digit (a dash, a bullet): it cannot be blanked. */
  selectable: boolean;
}

const WORD = /\S+/gu;
/** Letters, digits and the marks that belong to them (Arabic harakat, Devanagari vowel signs): a blank never strips a mark off its letter. */
const CORE = /[\p{L}\p{N}\p{M}]/gu;
const SOUND = /[\p{L}\p{N}]/u;

export function splitWords(passage: string): Word[] {
  const words: Word[] = [];
  for (const m of passage.matchAll(WORD)) {
    const start = m.index ?? 0;
    const token = m[0];
    let first = -1;
    let last = -1;
    for (const c of token.matchAll(CORE)) {
      const at = c.index ?? 0;
      if (first < 0) first = at;
      last = at + c[0].length;
    }
    words.push({
      text: token,
      start,
      end: start + token.length,
      coreStart: first < 0 ? start : start + first,
      coreEnd: first < 0 ? start + token.length : start + last,
      selectable: first >= 0 && SOUND.test(token),
    });
  }
  return words;
}

/** Overlapping ranges become one; ranges that merely touch stay apart. Out-of-range and unselectable ends are trimmed away. */
export function mergeRanges(words: readonly Word[], ranges: readonly WordRange[]): WordRange[] {
  const usable: WordRange[] = [];
  for (const r of ranges) {
    let from = Math.max(0, Math.min(r.from, r.to));
    let to = Math.min(words.length - 1, Math.max(r.from, r.to));
    while (from <= to && !words[from]?.selectable) from++;
    while (to >= from && !words[to]?.selectable) to--;
    if (from <= to) usable.push({ from, to });
  }
  usable.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: WordRange[] = [];
  for (const r of usable) {
    const prev = merged[merged.length - 1];
    if (prev && r.from <= prev.to) prev.to = Math.max(prev.to, r.to);
    else merged.push({ ...r });
  }
  return merged;
}

/** Whether a passage can carry cloze syntax at all: it must not hold a brace pair or the `::` hint separator. */
export const isClozeSafe = (passage: string): boolean =>
  !passage.includes('{{') && !passage.includes('}}') && !passage.includes('::');

export type ClozeBuild = { ok: true; text: string; count: number } | { ok: false; error: HighlightCardError };

/** The passage with each merged range wrapped in `{{cN::…}}`; the punctuation around a blank stays outside it. */
export function buildCloze(passage: string, ranges: readonly WordRange[]): ClozeBuild {
  if (!isClozeSafe(passage)) return { ok: false, error: 'unsafe-text' };
  const words = splitWords(passage);
  const merged = mergeRanges(words, ranges);
  if (merged.length === 0) return { ok: false, error: 'no-blanks' };
  if (merged.length > MAX_CLOZE_DELETIONS) return { ok: false, error: 'too-many-blanks' };
  let out = '';
  let at = 0;
  merged.forEach((r, i) => {
    const from = (words[r.from] as Word).coreStart;
    const to = (words[r.to] as Word).coreEnd;
    out += `${passage.slice(at, from)}{{c${i + 1}::${passage.slice(from, to)}}}`;
    at = to;
  });
  out += passage.slice(at);
  return { ok: true, text: out, count: merged.length };
}

/* --------------------------------- shapes --------------------------------- */

/** Whether `text` (trimmed) is a non-empty part of the highlight's own text. */
export const isPassageOf = (text: string, exact: string): boolean => {
  const trimmed = text.trim();
  return trimmed !== '' && exact.includes(trimmed);
};

const ATTRIBUTION_LEAD = '\n— ';
const MIN_TITLE_ROOM = 8;

/** The back of a basic card: the passage, then "— Title" when it fits (a long title is cut with an ellipsis; none when there is no room). */
export function basicBack(passage: string, title: string | null): string {
  const text = passage.trim();
  const name = (title ?? '').trim();
  if (name === '') return text;
  const room = CARD_SIDE_MAX - text.length - ATTRIBUTION_LEAD.length;
  if (room >= name.length) return `${text}${ATTRIBUTION_LEAD}${name}`;
  if (room >= MIN_TITLE_ROOM) return `${text}${ATTRIBUTION_LEAD}${name.slice(0, room - 1).trimEnd()}…`;
  return text;
}

export interface LengthCheck {
  ok: boolean;
  length: number;
  max: number;
}

/**
 * The length rule per shape. A basic card's back is the passage (500); a cloze card's whole text with its markup
 * (1,000), so pass `clozeText` once words are picked and the count follows the markup.
 */
export function lengthCheck(shape: CardShape, passage: string, clozeText?: string): LengthCheck {
  const text = passage.trim();
  if (shape === 'basic') return { ok: text.length <= CARD_SIDE_MAX, length: text.length, max: CARD_SIDE_MAX };
  const length = clozeText !== undefined ? clozeText.length : text.length;
  return { ok: length <= CLOZE_TEXT_MAX, length, max: CLOZE_TEXT_MAX };
}

/** An item and the highlight's stored text (and document title) in, a card draft or the reason it is refused out. */
export function draftFromItem(
  item: HighlightCardItem,
  highlight: { exact: string; title: string | null },
): { ok: true; draft: HighlightCardDraft } | { ok: false; error: HighlightCardError } {
  const passage = item.text.trim();
  if (passage === '') return { ok: false, error: 'passage-empty' };
  if (!highlight.exact.includes(passage)) return { ok: false, error: 'not-in-highlight' };
  if (item.shape === 'basic') {
    const front = item.front.trim();
    if (front === '') return { ok: false, error: 'front-required' };
    if (front.length > CARD_SIDE_MAX) return { ok: false, error: 'front-too-long' };
    if (!lengthCheck('basic', passage).ok) return { ok: false, error: 'passage-too-long' };
    return { ok: true, draft: { kind: 'basic', front, back: basicBack(passage, highlight.title) } };
  }
  const built = buildCloze(passage, item.deletions);
  if (!built.ok) return built;
  if (!lengthCheck('cloze', passage, built.text).ok) return { ok: false, error: 'cloze-too-long' };
  return { ok: true, draft: { kind: 'cloze', front: built.text, back: '' } };
}
