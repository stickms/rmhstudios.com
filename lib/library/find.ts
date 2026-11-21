/**
 * Find in book — pure text matching for the library reader (feature 13).
 *
 * The reader searches text it has already extracted a page (PDF) or chapter
 * (EPUB) at a time. Matching ignores case and diacritics, treats any run of
 * whitespace as one space and joins words hyphenated across a line end, so a
 * phrase that wraps still matches. Every match is reported as a range into the
 * ORIGINAL text, because that is the string the reader's text view renders and
 * the snippets are cut from. This file is client-safe and has no I/O.
 */

export interface NormaliseOptions {
  /** Keep letter case. Diacritics are ignored either way. */
  matchCase: boolean;
  /** BCP 47 tag of the document language, for locale-aware lower-casing. */
  locale?: string;
}

export interface FindOptions extends NormaliseOptions {
  /** A match must not touch a letter or digit on either side. */
  wholeWords: boolean;
}

/** A half-open range of UTF-16 offsets into the original text. */
export interface MatchRange {
  start: number;
  end: number;
}

/**
 * Searchable text plus the way back: `starts[i]` / `ends[i]` are the original
 * offsets of the source character that produced `text[i]`.
 */
export interface Normalised {
  text: string;
  starts: Uint32Array;
  ends: Uint32Array;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
  /** The snippet was cut before the first or after the last character shown. */
  cutBefore: boolean;
  cutAfter: boolean;
}

const SOFT_HYPHEN = '­';
/** What follows a hyphen that ends a line: the break and the next word's first letter. */
const BREAK_TAIL = '[ \\t]*\\r?\\n[ \\t]*(?=\\p{L})';
const BREAK_STICKY = new RegExp(BREAK_TAIL, 'uy');
const HYPHENATED = new RegExp(`(\\p{L})[-\\u2010\\u00AD]${BREAK_TAIL}`, 'gu');
const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/u;

/** `exam-\nple` becomes `example`. */
export function joinHyphenated(text: string): string {
  return text.replace(HYPHENATED, '$1');
}

/**
 * NFKD, combining marks removed, whitespace runs collapsed to one space,
 * hyphenation at line ends joined, lower-cased unless `matchCase`.
 */
export function normalise(text: string, options: NormaliseOptions): Normalised {
  let out = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let lastChar = '';

  const emit = (chunk: string, start: number, end: number) => {
    for (let k = 0; k < chunk.length; k++) {
      starts.push(start);
      ends.push(end);
    }
    out += chunk;
    lastChar = chunk.charAt(chunk.length - 1);
  };

  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    const end = i + ch.length;

    if (ch === SOFT_HYPHEN) {
      i = end;
      continue;
    }
    if ((ch === '-' || ch === '‐') && LETTER.test(lastChar)) {
      BREAK_STICKY.lastIndex = end;
      const tail = BREAK_STICKY.exec(text);
      if (tail) {
        i = end + tail[0].length;
        continue;
      }
    }

    for (const part of ch.normalize('NFKD')) {
      if (SPACE.test(part)) {
        if (lastChar === ' ' && ends.length > 0) ends[ends.length - 1] = end;
        else emit(' ', i, end);
        continue;
      }
      const folded = options.matchCase ? part : part.toLocaleLowerCase(options.locale);
      for (const unit of folded) {
        if (MARK.test(unit)) continue;
        emit(unit, i, end);
      }
    }
    i = end;
  }

  return {
    text: out,
    starts: Uint32Array.from(starts),
    ends: Uint32Array.from(ends),
  };
}

function isWordBefore(text: string, index: number): boolean {
  if (index <= 0) return false;
  const low = text.charCodeAt(index - 1);
  const pairStart = low >= 0xdc00 && low <= 0xdfff && index > 1 ? index - 2 : index - 1;
  return WORD_CHAR.test(String.fromCodePoint(text.codePointAt(pairStart)!));
}

function isWordAt(text: string, index: number): boolean {
  if (index >= text.length) return false;
  return WORD_CHAR.test(String.fromCodePoint(text.codePointAt(index)!));
}

/**
 * Matches of an already normalised query in already normalised text, as ranges
 * into the original text. Matches do not overlap.
 */
export function findNormalised(haystack: Normalised, query: string, wholeWords: boolean): MatchRange[] {
  if (!query) return [];
  const text = haystack.text;
  // A boundary only means something where the query itself starts or ends in a word.
  const checkStart = wholeWords && isWordAt(query, 0);
  const checkEnd = wholeWords && isWordBefore(query, query.length);
  const found: MatchRange[] = [];
  for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + query.length)) {
    const stop = at + query.length;
    if (checkStart && isWordBefore(text, at)) continue;
    if (checkEnd && isWordAt(text, stop)) continue;
    found.push({
      start: haystack.starts[at]!,
      end: haystack.ends[stop - 1]!,
    });
  }
  return found;
}

/** The query as it is compared: normalised and trimmed. Empty means nothing to search for. */
export function prepareQuery(query: string, options: NormaliseOptions): string {
  return normalise(query, options).text.trim();
}

/** Every match of `query` in one page or chapter, in order, as ranges into `text`. */
export function findInPage(text: string, query: string, options: FindOptions): MatchRange[] {
  const prepared = prepareQuery(query, options);
  if (!prepared) return [];
  return findNormalised(normalise(text, options), prepared, options.wholeWords);
}

function squash(text: string): string {
  return joinHyphenated(text).replace(/\s+/g, ' ');
}

/**
 * About `2 * radius` characters of context around a match, in three parts so
 * the caller can mark the middle. Never cuts a surrogate pair or separates a
 * base letter from its combining marks.
 */
export function snippet(text: string, range: MatchRange, radius = 40): Snippet {
  let from = Math.max(0, range.start - radius);
  while (from > 0 && (isLowSurrogate(text, from) || MARK.test(text.charAt(from)))) from--;
  let to = Math.min(text.length, range.end + radius);
  while (to < text.length && (isLowSurrogate(text, to) || MARK.test(text.charAt(to)))) to++;
  const before = squash(text.slice(from, range.start));
  const after = squash(text.slice(range.end, to));
  return {
    before: from > 0 ? before.trimStart() : before,
    match: squash(text.slice(range.start, range.end)),
    after: to < text.length ? after.trimEnd() : after,
    cutBefore: from > 0,
    cutAfter: to < text.length,
  };
}

function isLowSurrogate(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Offset into the text as the text view lays it out. A unit's text separates
 * paragraphs with blank lines, and the view renders each paragraph as a block,
 * which its DOM text index joins with a single newline; every extra newline in
 * a run is one character that the DOM does not have.
 */
export function toParagraphOffset(text: string, offset: number): number {
  let removed = 0;
  for (const run of text.matchAll(/\n{2,}/g)) {
    if (run.index >= offset) break;
    removed += Math.min(run[0].length - 1, offset - run.index - 1);
  }
  return offset - removed;
}

/** A match the reader is asked to show. `seq` makes a repeated jump to the same match a new event. */
export interface FindTarget {
  unit: number;
  range: MatchRange;
  seq: number;
}
