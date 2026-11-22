/**
 * Flashcard types (pure, no I/O). An authored card is basic, reversible or cloze; the server
 * generates sibling rows from it, each an ordinary card with its own spaced-repetition state:
 * a reversible card gets one sibling with the sides swapped, a cloze card gets one per distinct
 * deletion index. Cloze syntax is Anki's: `{{c1::answer}}` or `{{c1::answer::hint}}`, several
 * deletions may share an index (hidden together), nesting is refused. Card text is plain text:
 * masking produces parts or a string, never markup.
 */
import { CARD_SIDE_MAX, CLOZE_MAX_INDICES, CLOZE_TEXT_MAX } from '@/lib/study/limits';

export const CARD_KINDS = ['basic', 'reversible', 'cloze'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export function isCardKind(value: unknown): value is CardKind {
  return typeof value === 'string' && (CARD_KINDS as readonly string[]).includes(value);
}

/* ------------------------------ cloze parsing ------------------------------ */

export type ClozeError =
  /** `{{cN::` that never closes. */
  | 'unterminated'
  /** A deletion inside a deletion. */
  | 'nested'
  /** A deletion with no answer text. */
  | 'empty'
  /** Index 0, or larger than 999. */
  | 'bad-index'
  /** No deletion at all. */
  | 'no-deletions'
  /** More than {@link CLOZE_MAX_INDICES} distinct indices. */
  | 'too-many-indices';

export interface ClozeTextSegment {
  type: 'text';
  text: string;
}
export interface ClozeDeletionSegment {
  type: 'deletion';
  index: number;
  answer: string;
  hint: string | null;
}
export type ClozeSegment = ClozeTextSegment | ClozeDeletionSegment;

export type ClozeParse = { ok: true; segments: ClozeSegment[]; indices: number[] } | { ok: false; error: ClozeError };

const OPEN = /\{\{c(\d+)::/y;
const CLOZE_START = /\{\{c\d+::/;

/** Whether the text holds a `{{cN::` opener (it may still be malformed). */
export function hasCloze(text: string): boolean {
  return CLOZE_START.test(text);
}

/**
 * Split cloze text into plain and deletion segments. `indices` are the distinct deletion
 * indices, ascending. Text with no deletion at all is `no-deletions`; a stray `{{` or `}}`
 * that is not part of a deletion is ordinary text.
 */
export function parseCloze(text: string): ClozeParse {
  const segments: ClozeSegment[] = [];
  const found = new Set<number>();
  let plain = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      OPEN.lastIndex = i;
      const open = OPEN.exec(text);
      if (open) {
        const bodyStart = i + open[0].length;
        const close = text.indexOf('}}', bodyStart);
        if (close < 0) return { ok: false, error: 'unterminated' };
        const body = text.slice(bodyStart, close);
        if (CLOZE_START.test(body)) return { ok: false, error: 'nested' };
        const index = Number(open[1]);
        if (!Number.isInteger(index) || index < 1 || index > 999) return { ok: false, error: 'bad-index' };
        const split = body.indexOf('::');
        const answer = (split < 0 ? body : body.slice(0, split)).trim();
        const hint = split < 0 ? '' : body.slice(split + 2).trim();
        if (answer === '') return { ok: false, error: 'empty' };
        if (plain !== '') {
          segments.push({ type: 'text', text: plain });
          plain = '';
        }
        segments.push({ type: 'deletion', index, answer, hint: hint === '' ? null : hint });
        found.add(index);
        i = close + 2;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  if (plain !== '') segments.push({ type: 'text', text: plain });
  if (found.size === 0) return { ok: false, error: 'no-deletions' };
  if (found.size > CLOZE_MAX_INDICES) return { ok: false, error: 'too-many-indices' };
  return { ok: true, segments, indices: [...found].sort((a, b) => a - b) };
}

/** One part of a cloze side as drawn: plain text, a mask, or an answer shown in full. */
export type MaskedPart =
  { type: 'text'; text: string } | { type: 'mask'; hint: string | null } | { type: 'answer'; text: string };

/**
 * The parts of a cloze card for deletion `activeIndex` (null: every deletion is active, as in
 * the editor's list). On the front (`reveal` false) the active deletions are masks; on the back
 * they are answers. Deletions of other indices are plain text.
 */
export function maskCloze(
  segments: readonly ClozeSegment[],
  activeIndex: number | null,
  reveal: boolean,
): MaskedPart[] {
  return segments.map((s): MaskedPart => {
    if (s.type === 'text') return { type: 'text', text: s.text };
    if (activeIndex !== null && s.index !== activeIndex) return { type: 'text', text: s.answer };
    return reveal ? { type: 'answer', text: s.answer } : { type: 'mask', hint: s.hint };
  });
}

/** The answers of deletion `index`, in text order. */
export function clozeAnswers(segments: readonly ClozeSegment[], index: number): string[] {
  const out: string[] = [];
  for (const s of segments) if (s.type === 'deletion' && s.index === index) out.push(s.answer);
  return out;
}

/**
 * The front of a cloze card as one string, for a test prompt: the active deletions are `blank`
 * (the translated "[…]") or `[hint]`. Text that does not parse is returned as written.
 */
export function maskClozeText(text: string, activeIndex: number, blank: string): string {
  const parsed = parseCloze(text);
  if (!parsed.ok) return text;
  return maskCloze(parsed.segments, activeIndex, false)
    .map((p) => (p.type === 'mask' ? (p.hint === null ? blank : `[${p.hint}]`) : p.text))
    .join('');
}

/** The plain text of a cloze card, every deletion shown (a list row, a search). */
export function clozePlainText(text: string): string {
  const parsed = parseCloze(text);
  if (!parsed.ok) return text;
  return parsed.segments.map((s) => (s.type === 'text' ? s.text : s.answer)).join('');
}

/** The index the "Add deletion" button uses next: one past the largest in use (1 for none). */
export function nextClozeIndex(text: string): number {
  let max = 0;
  const all = /\{\{c(\d+)::/g;
  for (let m = all.exec(text); m; m = all.exec(text)) max = Math.max(max, Number(m[1]));
  return max + 1;
}

/**
 * Wrap the selection `[start, end)` in the next `{{cN::…}}`. Null when nothing is selected or the
 * result would not parse (a selection that cuts into an existing deletion). `selStart`/`selEnd`
 * select the wrapped answer afterwards.
 */
export function wrapDeletion(
  text: string,
  start: number,
  end: number,
): { text: string; selStart: number; selEnd: number } | null {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  if (to <= from || text.slice(from, to).trim() === '') return null;
  const index = nextClozeIndex(text);
  const open = `{{c${index}::`;
  const next = `${text.slice(0, from)}${open}${text.slice(from, to)}}}${text.slice(to)}`;
  if (next.length > CLOZE_TEXT_MAX) return null;
  // The result must parse, and hold the deletions the text had plus exactly the new one: a selection
  // that starts or ends inside an existing deletion would otherwise break it and still parse.
  const before = parseCloze(text);
  const after = parseCloze(next);
  if (!after.ok) return null;
  const kept = after.segments.filter((s) => s.type === 'deletion' && s.index !== index);
  const had = before.ok ? before.segments.filter((s) => s.type === 'deletion') : [];
  if (JSON.stringify(kept) !== JSON.stringify(had)) return null;
  return { text: next, selStart: from + open.length, selEnd: to + open.length };
}

/* ---------------------------- authored card input --------------------------- */

export interface CardInput {
  kind: CardKind;
  front: string;
  back: string;
}

export type CardError =
  'front-required' | 'back-required' | 'front-too-long' | 'back-too-long' | 'cloze-too-long' | `cloze-${ClozeError}`;

/**
 * Check an authored card and return it normalised (trimmed; a cloze card keeps no back, its
 * answers are the back of each generated card). The one rule set the editor, the zod schemas and
 * the server all use.
 */
export function validateCard(input: {
  kind?: CardKind | undefined;
  front: string;
  back?: string | undefined;
}): { ok: true; card: CardInput } | { ok: false; error: CardError } {
  const kind = input.kind ?? 'basic';
  const front = input.front.trim();
  const back = (input.back ?? '').trim();
  if (front === '') return { ok: false, error: 'front-required' };
  if (kind === 'cloze') {
    if (front.length > CLOZE_TEXT_MAX) return { ok: false, error: 'cloze-too-long' };
    const parsed = parseCloze(front);
    if (!parsed.ok) return { ok: false, error: `cloze-${parsed.error}` };
    return { ok: true, card: { kind, front, back: '' } };
  }
  if (front.length > CARD_SIDE_MAX) return { ok: false, error: 'front-too-long' };
  if (back === '') return { ok: false, error: 'back-required' };
  if (back.length > CARD_SIDE_MAX) return { ok: false, error: 'back-too-long' };
  return { ok: true, card: { kind, front, back } };
}

/* ------------------------------ sibling cards ------------------------------- */

/** A generated card. `key` is its identity across edits: `r` for the reverse, `c<N>` for deletion N. */
export interface Sibling {
  key: string;
  kind: 'reversible' | 'cloze';
  front: string;
  back: string;
  clozeIndex: number | null;
}

/** The rows an authored card generates: none for basic, the reverse for reversible, one per cloze index. */
export function siblingsFor(card: CardInput): Sibling[] {
  if (card.kind === 'reversible') {
    return [{ key: 'r', kind: 'reversible', front: card.back, back: card.front, clozeIndex: null }];
  }
  if (card.kind !== 'cloze') return [];
  const parsed = parseCloze(card.front);
  if (!parsed.ok) return [];
  return parsed.indices.map((index) => ({
    key: `c${index}`,
    kind: 'cloze' as const,
    front: card.front,
    back: clozeAnswers(parsed.segments, index).join(', '),
    clozeIndex: index,
  }));
}

/** How many rows an authored card occupies in its deck: itself and its siblings. */
export function rowsFor(card: CardInput): number {
  return 1 + siblingsFor(card).length;
}

export interface ExistingSibling {
  id: string;
  kind: string;
  front: string;
  back: string;
  clozeIndex: number | null;
}

export interface RegenerationPlan {
  /** Siblings that survive with changed text: same id, so their schedules stay. */
  update: { id: string; front: string; back: string }[];
  /** Siblings that are new. */
  create: Sibling[];
  /** Siblings whose index or role is gone: deleted with their reviews. */
  remove: string[];
}

const keyOf = (s: { clozeIndex: number | null; kind: string }): string =>
  s.clozeIndex !== null ? `c${s.clozeIndex}` : s.kind === 'reversible' ? 'r' : '';

/**
 * Reconcile an authored card's stored siblings with what it should generate now. A sibling is
 * matched by its key, so editing the text keeps the row (and the member's schedule), dropping
 * c2 removes only c2, and adding c3 creates only c3. A duplicate or unrecognised row is removed.
 */
export function planRegeneration(existing: readonly ExistingSibling[], desired: readonly Sibling[]): RegenerationPlan {
  const want = new Map(desired.map((s) => [s.key, s]));
  const matched = new Set<string>();
  const plan: RegenerationPlan = { update: [], create: [], remove: [] };
  for (const row of existing) {
    const key = keyOf(row);
    const target = want.get(key);
    if (!target || matched.has(key)) {
      plan.remove.push(row.id);
      continue;
    }
    matched.add(key);
    if (row.front !== target.front || row.back !== target.back) {
      plan.update.push({ id: row.id, front: target.front, back: target.back });
    }
  }
  for (const s of desired) if (!matched.has(s.key)) plan.create.push(s);
  return plan;
}

/* ----------------------------- reading a card row ---------------------------- */

/** The fields of a stored card that decide how it is drawn. */
export interface StoredCard {
  kind: string;
  sourceId: string | null;
  clozeIndex: number | null;
}

/** Authored cloze rows hold the text only; they are never reviewed or tested. */
export function isReviewable(card: Pick<StoredCard, 'kind' | 'sourceId'>): boolean {
  return !(card.kind === 'cloze' && card.sourceId === null);
}

/** A generated reverse card: shown with "Reverse" above it. */
export function isReverseCard(card: Pick<StoredCard, 'kind' | 'sourceId' | 'clozeIndex'>): boolean {
  return card.kind === 'reversible' && card.sourceId !== null && card.clozeIndex === null;
}

/** The note a card belongs to: an authored card's own id, a sibling's source. */
export function noteIdOf(card: { id: string; sourceId: string | null }): string {
  return card.sourceId ?? card.id;
}
