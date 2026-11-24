import { hasPersonShape, type HandleSource } from '../sdn-rules';

/**
 * Scrubbing a prompt a forum post carried (reject-not-redact). A forum post is a person's text; a prompt is institutional
 * text, so a candidate is kept only if nothing in it could name, quote or describe a person. Page and school sources are
 * institutional and do not come through here.
 */

export const PROMPT_MIN = 20; // shorter is a fragment, not a prompt
export const PROMPT_MAX = 600;

/** First person singular: a forum post's narration, never the school's wording. */
const FIRST_PERSON_RE = /\b(?:I|I'm|I've|I'd|I'll|me|my|mine|myself)\b|\bI[’]\w+/i;
/**
 * What a school's prompt looks like, as `scrubQuestion` asks of a question: it holds a `?`, or starts with a prompt verb
 * or word (optionally after a "Prompt 2:" label or "Please"), or is a "Prompt:" / "Question:" line. A forum post's
 * narration ("The dean told her the class was full") has none of these, and a prompt is never third-person narration.
 */
const PROMPT_LABEL_RE = /^(?:prompt|question|essay)\s*\d*\s*[:.)-]/i;
const PROMPT_START_RE = new RegExp(
  '^(?:(?:prompt|question|essay)\\s*\\d*\\s*[:.)-]\\s*)?(?:please\\s+)?(?:' +
    [
      'describe', 'tell', 'explain', 'discuss', 'share', 'reflect', 'write', 'identify', 'list', 'provide', 'give',
      'elaborate', 'outline', 'talk', 'comment', 'detail', 'address', 'expand', 'summari[sz]e', 'consider', 'choose',
      'select', 'use', 'using', 'why', 'what', 'how', 'who', 'when', 'where', 'which', 'if', 'in\\s+(?:your|\\d+)', 'think',
      'recall', 'name', 'indicate', 'state', 'briefly', 'submit',
    ].join('|') +
    ')\\b',
  'i',
);
/** A quote or reply artefact: a "> " quote line, a `[quote` tag, "Name said:" or "Name wrote:". */
const QUOTE_RE = /^\s*>|\[\/?quote\b|\b\w+\s+(?:said|wrote|asked|posted|replied)\s*:/i;

function capitalShare(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return 0;
  return letters.replace(/[^A-Z]/g, '').length / letters.length;
}

/** Null = rejected. Returns the trimmed, single-spaced text of an accepted prompt. */
export function scrubForumPrompt(text: string, handles: HandleSource): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < PROMPT_MIN || t.length > PROMPT_MAX) return null;
  // The raw text is checked for a quote marker first: whitespace collapsing must not hide a leading ">".
  if (QUOTE_RE.test(text) || QUOTE_RE.test(t)) return null;
  if (hasPersonShape(t, handles)) return null;
  if (FIRST_PERSON_RE.test(t)) return null;
  if (!t.includes('?') && !PROMPT_LABEL_RE.test(t) && !PROMPT_START_RE.test(t)) return null;
  if (capitalShare(t) > 0.6) return null;
  return t;
}
