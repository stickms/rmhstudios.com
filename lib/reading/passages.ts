/**
 * Passages — the unit "N readers highlighted this" counts over (idea L8).
 * Pure and client-safe; shared by the browser (which computes them) and the
 * server (which stores the counters).
 *
 * Two readers rarely select the exact same characters, so counting identical
 * highlight ranges would almost never reach the three-reader threshold. A
 * passage is therefore a *sentence*: a highlight counts toward every sentence
 * it touches, identified by a hash of the sentence's normalised text. The hash
 * (not an offset) is the key so the count survives edits elsewhere in the
 * document, and goes quiet — rather than pointing at the wrong place — when
 * the sentence itself is edited.
 */

export interface PassageRef {
  /** Hash of the normalised sentence. */
  passage: string;
  /** The sentence text (capped), so the client can find it again to underline. */
  sample: string;
  /** Offset of the sentence in the unit text, a hint for re-anchoring. */
  start: number;
}

export const MAX_PASSAGES_PER_HIGHLIGHT = 4;
export const PASSAGE_SAMPLE_MAX = 400;
/** Sentences shorter than this (normalised) are too generic to count. */
const MIN_PASSAGE_CHARS = 12;
/** A passage needs at least this many distinct readers before it is shown. */
export const MIN_READERS_TO_SHOW = 3;

/** cyrb53: a small, well-distributed 53-bit string hash (not cryptographic). */
export function hashText(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** A short version stamp for a unit's text (stored with each highlight). */
export function textVersion(text: string): string {
  return hashText(text).slice(-12);
}

export function normalizePassage(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, PASSAGE_SAMPLE_MAX);
}

const SENTENCE = /[^\n]+?(?:[.!?]+["')\]”’]*(?=\s|$)|(?=\n)|$)/g;

/** Sentence ranges of `text` (leading whitespace trimmed; a paragraph break also ends one). */
export function splitSentences(text: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of text.matchAll(SENTENCE)) {
    if (m[0].length === 0) continue;
    const lead = m[0].length - m[0].trimStart().length;
    const start = m.index + lead;
    const end = m.index + m[0].length;
    if (end > start) out.push({ start, end });
  }
  return out;
}

/** The sentences a highlight `[start, end)` touches, capped, as passage refs. */
export function passagesFor(text: string, start: number, end: number): PassageRef[] {
  const out: PassageRef[] = [];
  const seen = new Set<string>();
  for (const b of splitSentences(text)) {
    if (b.end <= start) continue;
    if (b.start >= Math.max(end, start + 1)) break;
    const sentence = text.slice(b.start, b.end);
    const norm = normalizePassage(sentence);
    if (norm.length < MIN_PASSAGE_CHARS) continue;
    const passage = hashText(norm);
    if (seen.has(passage)) continue;
    seen.add(passage);
    out.push({ passage, sample: sentence.slice(0, PASSAGE_SAMPLE_MAX), start: b.start });
    if (out.length >= MAX_PASSAGES_PER_HIGHLIGHT) break;
  }
  return out;
}
