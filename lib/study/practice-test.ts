/**
 * Practice tests built from a flashcard deck. Pure and synchronous: the same cards, options and
 * seed always give the same questions in the same order (that is what "retake" relies on), so all
 * randomness comes from `mulberry32` / `shuffle` in `lib/core/rng.ts` and never from `Math.random`.
 * A test never touches SM-2 scheduling; its result is stored apart (`lib/study/tests.server.ts`).
 */
import { mulberry32, shuffle } from '@/lib/core/rng';
import { maskClozeText } from '@/lib/study/card-types';
import type { CardImage } from '@/lib/study/card-images';
import type { CardSound } from '@/lib/study/card-sound';
import type { OcclusionReviewData } from '@/lib/study/occlusion';

export const TEST_KINDS = ['multiple-choice', 'written', 'true-false', 'matching'] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const TEST_DIRECTIONS = ['back', 'front', 'mixed'] as const;
/** `back`: the card's front is the prompt and the back is the answer; `front`: the reverse. */
export type TestDirection = (typeof TEST_DIRECTIONS)[number];

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 50;
export const MAX_MATCH_PAIRS = 6;
/** Most points a test can hold: fifty matching questions of six pairs. */
export const MAX_TEST_POINTS = MAX_QUESTIONS * MAX_MATCH_PAIRS;
const MC_OPTIONS = 4;
/** Distractors are drawn from the answers closest in length; this many candidates are kept. */
const DISTRACTOR_WINDOW = 9;
/** A one-edit slip is only "almost" when the expected answer is at least this long. */
const ALMOST_MIN_LENGTH = 6;

export interface TestCard {
  id: string;
  front: string;
  back: string;
  /** Set on a cloze card: `front` is the whole text and this deletion is the one asked. */
  clozeIndex?: number | null | undefined;
  /** The authored card this one belongs to; cards of one note are one fact, asked about once. */
  noteId?: string | undefined;
  /** The pictures the card shows, a generated card's read from its source (s08-15). */
  frontImage?: CardImage | null | undefined;
  backImage?: CardImage | null | undefined;
  /** The deck owner's own sounds, on their side of the card (s10-02); absent for every other student. */
  frontSound?: CardSound | null | undefined;
  backSound?: CardSound | null | undefined;
  /** Set on a generated occlusion card: the masks and the one asked, drawn over `frontImage` (s09-03). */
  occlusion?: OcclusionReviewData | null | undefined;
}

export interface TestOptions {
  /** Wanted number of questions; clamped to the pool size and to 1..50. */
  count: number;
  kinds: readonly TestKind[];
  direction: TestDirection;
  /** Ask only about these cards (the missed-cards test); distractors still come from the whole deck. */
  onlyCardIds?: readonly string[] | undefined;
  /** The "[…]" a cloze prompt shows in place of its deletion (translated by the caller). */
  blank?: string | undefined;
}

export interface MultipleChoiceQuestion {
  kind: 'multiple-choice';
  cardId: string;
  prompt: string;
  /** The picture on the prompt's side of the card, when it has one (s08-15). */
  promptImage?: CardImage;
  /** The sound on the prompt's side, when the student owns the deck and the card has one (s10-02). */
  promptSound?: CardSound;
  /** Which side of the card the prompt sound is on, for the button's name. */
  promptSoundSide?: Side;
  /** The masks to draw over `promptImage`, on an occlusion card (the prompt may then be empty: the component says it). */
  promptOcclusion?: OcclusionReviewData;
  options: string[];
  answerIndex: number;
}
export interface WrittenQuestion {
  kind: 'written';
  cardId: string;
  prompt: string;
  promptImage?: CardImage;
  promptSound?: CardSound;
  /** Which side of the card the prompt sound is on, for the button's name. */
  promptSoundSide?: Side;
  /** The masks to draw over `promptImage`, on an occlusion card (the prompt may then be empty: the component says it). */
  promptOcclusion?: OcclusionReviewData;
  answer: string;
}
export interface TrueFalseQuestion {
  kind: 'true-false';
  cardId: string;
  prompt: string;
  promptImage?: CardImage;
  promptSound?: CardSound;
  /** Which side of the card the prompt sound is on, for the button's name. */
  promptSoundSide?: Side;
  /** The masks to draw over `promptImage`, on an occlusion card (the prompt may then be empty: the component says it). */
  promptOcclusion?: OcclusionReviewData;
  /** The answer shown next to the prompt; it is the real one when `isTrue`. */
  shown: string;
  /** The real answer, for the results screen. */
  answer: string;
  isTrue: boolean;
}
export interface MatchingQuestion {
  kind: 'matching';
  /** Terms in deck order; each carries the card whose definition it matches. */
  terms: { cardId: string; text: string }[];
  /** The same cards' definitions in shuffled order. */
  definitions: { cardId: string; text: string }[];
}
export type TestQuestion = MultipleChoiceQuestion | WrittenQuestion | TrueFalseQuestion | MatchingQuestion;

export type WrittenGrade = 'correct' | 'almost' | 'wrong';

/** The student's answer to one question. */
export type TestResponse =
  | { kind: 'multiple-choice'; choice: number }
  | { kind: 'written'; text: string; accepted?: boolean }
  | { kind: 'true-false'; answer: boolean }
  | { kind: 'matching'; pairs: Record<string, string> };

export interface QuestionScore {
  points: number;
  max: number;
  /** Cards the student got wrong (for a matching question, each unmatched or mismatched term). */
  missedCardIds: string[];
}

export interface TestScore {
  correct: number;
  total: number;
  /** Per question; `null` for a question that was not answered. */
  perQuestion: (QuestionScore | null)[];
  answered: number;
  missedCardIds: string[];
}

export interface KindAvailability {
  available: boolean;
  /** i18n key suffix explaining why a kind is unavailable; the component translates it. */
  reason?: 'needs-four-answers' | 'needs-two-cards';
}

/**
 * Lower-case, accent-free, punctuation-free form used to compare typed answers: case folded for
 * `locale`, NFKD with the combining marks removed, `\p{P}` removed, whitespace collapsed.
 */
export function normalizeAnswer(text: string, locale?: string): string {
  // Case folding comes first so a locale rule (Turkish dotted I) sees the capital before NFKD splits it.
  let lowered: string;
  try {
    lowered = text.toLocaleLowerCase(locale);
  } catch {
    lowered = text.toLowerCase(); // an invalid locale tag
  }
  lowered = lowered.normalize('NFKD').replace(/\p{M}/gu, '');
  return lowered.replace(/\p{P}/gu, '').replace(/\s+/gu, ' ').trim();
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions), by code point. */
function editDistance(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let d = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d = Math.min(d, (prev2[j - 2] ?? 0) + 1);
      }
      cur[j] = d;
    }
    prev2.length = 0;
    prev2.push(...prev);
    prev = cur;
  }
  return prev[t.length] ?? 0;
}

function sameText(a: string, b: string, locale?: string): boolean {
  if (a === b) return true;
  try {
    return new Intl.Collator(locale, { sensitivity: 'base' }).compare(a, b) === 0;
  } catch {
    return false;
  }
}

/**
 * Forgiving grading of a typed answer. Case, surrounding whitespace, punctuation and diacritics
 * are ignored; a single edit (insert, delete, substitute or swap two neighbours) is `almost`, but
 * only when the expected answer is at least six characters, so short answers stay exact.
 */
export function gradeWritten(expected: string, given: string, locale?: string): WrittenGrade {
  const want = normalizeAnswer(expected, locale);
  const got = normalizeAnswer(given, locale);
  if (want === '' && got === '') return expected.trim() === given.trim() ? 'correct' : 'wrong';
  if (got === '') return 'wrong';
  if (sameText(want, got, locale)) return 'correct';
  if ([...want].length >= ALMOST_MIN_LENGTH && editDistance(want, got) <= 1) return 'almost';
  return 'wrong';
}

type Side = 'front' | 'back';

const DEFAULT_BLANK = '[…]';

/** A cloze card is always asked front to back: its front is the text with the deletion masked. */
function isCloze(card: TestCard): card is TestCard & { clozeIndex: number } {
  return card.clozeIndex !== undefined && card.clozeIndex !== null;
}
/** The side a card is asked from: a cloze card ignores the test's direction. */
function askSideOf(card: TestCard, ask: Side): Side {
  return isCloze(card) ? 'front' : ask;
}

function promptOf(card: TestCard, ask: Side, blank: string): string {
  if (isCloze(card)) return maskClozeText(card.front, card.clozeIndex, blank);
  return ask === 'front' ? card.front : card.back;
}
/**
 * The picture on the side a question asks from; a cloze prompt is text only (its picture sits on the back). An
 * occlusion card asks about its front picture with the masks drawn over it.
 */
function promptImageOf(
  card: TestCard,
  ask: Side,
): { promptImage: CardImage; promptOcclusion?: OcclusionReviewData } | Record<string, never> {
  if (card.occlusion) return card.frontImage ? { promptImage: card.frontImage, promptOcclusion: card.occlusion } : {};
  const image = isCloze(card) ? null : ask === 'front' ? card.frontImage : card.backImage;
  return image ? { promptImage: image } : {};
}
/**
 * The sound on the side a question asks from. A cloze or occlusion card's only sound is on its back, which is
 * the answer side, so those questions play none.
 */
function promptSoundOf(
  card: TestCard,
  ask: Side,
): { promptSound: CardSound; promptSoundSide: Side } | Record<string, never> {
  if (card.occlusion || isCloze(card)) return {};
  const sound = ask === 'front' ? card.frontSound : card.backSound;
  return sound ? { promptSound: sound, promptSoundSide: ask } : {};
}
function answerOf(card: TestCard, ask: Side): string {
  if (isCloze(card)) return card.back;
  return ask === 'front' ? card.back : card.front;
}
/** The text a card offers as an answer on `side`; a cloze card's front is its whole sentence, never an answer. */
function sideText(card: TestCard, side: Side): string | null {
  if (side === 'back') return card.back;
  return isCloze(card) ? null : card.front;
}

function distinctCount(cards: readonly TestCard[], side: Side): number {
  const seen = new Set<string>();
  for (const c of cards) {
    const text = sideText(c, side);
    if (text !== null) seen.add(normalizeAnswer(text));
  }
  return seen.size;
}

/**
 * Cards of one note (a reversible card and its reverse, the cards of one cloze text) are one fact. Each mask of an
 * occlusion card is its own fact (a different part of the picture), so it is its own note.
 */
function noteKey(card: TestCard): string {
  return card.occlusion ? card.id : (card.noteId ?? card.id);
}
/** How many facts the cards hold: the most questions a test can have. */
export function factCount(cards: readonly TestCard[]): number {
  return new Set(cards.map(noteKey)).size;
}
/** The first card of each note, in the order given. */
function onePerNote(cards: readonly TestCard[]): TestCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const key = noteKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Which kinds this deck can support. Multiple choice needs four different answers (in each
 * direction the test may ask), matching needs two cards, written and true/false always work.
 */
export function availableKinds(
  cards: readonly TestCard[],
  direction: TestDirection,
  focusCount: number = factCount(cards),
): Record<TestKind, KindAvailability> {
  const answerSides: Side[] = direction === 'back' ? ['back'] : direction === 'front' ? ['front'] : ['back', 'front'];
  const enoughAnswers = answerSides.every((side) => distinctCount(cards, side) >= MC_OPTIONS);
  return {
    'multiple-choice': enoughAnswers ? { available: true } : { available: false, reason: 'needs-four-answers' },
    written: { available: true },
    'true-false': { available: true },
    matching: focusCount >= 2 ? { available: true } : { available: false, reason: 'needs-two-cards' },
  };
}

/** The number of questions a test can have: capped at 50 and at the number of cards asked about. */
export function maxQuestions(poolSize: number): number {
  return Math.max(0, Math.min(MAX_QUESTIONS, poolSize));
}

interface AnswerEntry {
  text: string;
  norm: string;
  length: number;
}

function answerPool(cards: readonly TestCard[], side: Side): AnswerEntry[] {
  const seen = new Set<string>();
  const out: AnswerEntry[] = [];
  for (const c of cards) {
    const text = sideText(c, side);
    if (text === null) continue;
    const norm = normalizeAnswer(text);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ text, norm, length: [...text].length });
  }
  return out;
}

/** The `window` entries closest in length to `target`, ties broken by the seeded generator. */
function closestByLength(
  pool: readonly AnswerEntry[],
  skipNorm: string,
  target: number,
  rand: () => number,
): AnswerEntry[] {
  const best: { key: number; entry: AnswerEntry }[] = [];
  for (const entry of pool) {
    if (entry.norm === skipNorm) continue;
    const key = Math.abs(entry.length - target) + rand();
    if (best.length === DISTRACTOR_WINDOW && key >= (best[best.length - 1]?.key ?? Infinity)) continue;
    let i = best.length;
    while (i > 0 && (best[i - 1]?.key ?? 0) > key) i--;
    best.splice(i, 0, { key, entry });
    if (best.length > DISTRACTOR_WINDOW) best.pop();
  }
  return best.map((b) => b.entry);
}

/**
 * Build a test. Each card is asked about at most once; a matching question uses up to six
 * consecutive cards of the shuffled pool. `kinds` that cannot be built (multiple choice without
 * four answers, matching with one card left) fall back to a written question, so the result always
 * has `min(count, pool)` questions.
 */
export function buildTest(cards: readonly TestCard[], options: TestOptions, seed: number): TestQuestion[] {
  const rand = mulberry32(seed);
  const only = options.onlyCardIds ? new Set(options.onlyCardIds) : null;
  const poolCards = only ? cards.filter((c) => only.has(c.id)) : cards;
  const facts = factCount(poolCards);
  const count = Math.max(0, Math.min(Math.floor(options.count), maxQuestions(facts)));
  if (count === 0 || options.kinds.length === 0) return [];
  const blank = options.blank ?? DEFAULT_BLANK;

  // A fact is asked once: of a reversible card and its reverse, or the cards of one cloze text, the
  // shuffle decides which one the test uses.
  const pool = onePerNote(shuffle(poolCards, rand));
  const availability = availableKinds(cards, options.direction, facts);
  const kinds = options.kinds.filter((k) => availability[k].available);
  const usable: readonly TestKind[] = kinds.length > 0 ? kinds : ['written'];

  // Kinds are dealt evenly, then put in a seeded order.
  const plan = shuffle(
    Array.from({ length: count }, (_, i) => usable[i % usable.length] as TestKind),
    rand,
  );
  const tfCount = plan.filter((k) => k === 'true-false').length;
  const truths = shuffle(
    Array.from({ length: tfCount }, (_, i) => i % 2 === 0),
    rand,
  );

  const distractorPools: Partial<Record<Side, AnswerEntry[]>> = {};
  const poolFor = (side: Side): AnswerEntry[] => (distractorPools[side] ??= answerPool(cards, side));

  const questions: TestQuestion[] = [];
  let next = 0;
  let tfIndex = 0;
  for (let i = 0; i < count; i++) {
    let kind = plan[i] as TestKind;
    const direction: 'back' | 'front' =
      options.direction === 'mixed' ? (rand() < 0.5 ? 'back' : 'front') : options.direction;
    // Answering with the back means the front is the prompt.
    const ask: Side = direction === 'back' ? 'front' : 'back';
    // Leave at least one card for each question still to come.
    const spare = pool.length - next - (count - i - 1);

    if (kind === 'matching' && spare < 2) kind = 'written';
    // A mask is a place on a picture, not a term to pair with a definition: a group holding one is asked one by one.
    const group = kind === 'matching' ? pool.slice(next, next + Math.min(MAX_MATCH_PAIRS, spare)) : [];
    if (group.some((c) => c.occlusion)) kind = 'written';
    if (kind === 'matching') {
      next += group.length;
      questions.push({
        kind: 'matching',
        terms: group.map((c) => ({ cardId: c.id, text: promptOf(c, askSideOf(c, ask), blank) })),
        definitions: shuffle(group, rand).map((c) => ({ cardId: c.id, text: answerOf(c, askSideOf(c, ask)) })),
      });
      continue;
    }

    const card = pool[next++] as TestCard;
    const cardAsk = askSideOf(card, ask);
    const answerSide: Side = cardAsk === 'front' ? 'back' : 'front';
    const prompt = promptOf(card, cardAsk, blank);
    const answer = answerOf(card, cardAsk);
    const answerNorm = normalizeAnswer(answer);

    if (kind === 'multiple-choice') {
      const picked = shuffle(closestByLength(poolFor(answerSide), answerNorm, [...answer].length, rand), rand).slice(
        0,
        MC_OPTIONS - 1,
      );
      if (picked.length === MC_OPTIONS - 1) {
        const options4 = shuffle([answer, ...picked.map((p) => p.text)], rand);
        questions.push({
          kind: 'multiple-choice',
          cardId: card.id,
          prompt,
          ...promptImageOf(card, cardAsk),
          ...promptSoundOf(card, cardAsk),
          options: options4,
          answerIndex: options4.indexOf(answer),
        });
        continue;
      }
      kind = 'written';
    }

    if (kind === 'true-false') {
      const wantTrue = truths[tfIndex++] ?? true;
      const wrong = wantTrue ? [] : closestByLength(poolFor(answerSide), answerNorm, [...answer].length, rand);
      const other = wrong.length > 0 ? shuffle(wrong, rand)[0] : undefined;
      questions.push({
        kind: 'true-false',
        cardId: card.id,
        prompt,
        ...promptImageOf(card, cardAsk),
        ...promptSoundOf(card, cardAsk),
        shown: other ? other.text : answer,
        answer,
        isTrue: !other,
      });
      continue;
    }

    questions.push({
      kind: 'written',
      cardId: card.id,
      prompt,
      ...promptImageOf(card, cardAsk),
      ...promptSoundOf(card, cardAsk),
      answer,
    });
  }
  return questions;
}

/** How many points a question is worth: one, or one per pair in a matching question. */
export function questionPoints(question: TestQuestion): number {
  return question.kind === 'matching' ? question.terms.length : 1;
}

/** Score one answered question. */
export function scoreQuestion(question: TestQuestion, response: TestResponse, locale?: string): QuestionScore {
  const max = questionPoints(question);
  if (question.kind === 'matching' && response.kind === 'matching') {
    const missed: string[] = [];
    let points = 0;
    for (const term of question.terms) {
      const chosen = response.pairs[term.cardId];
      const own = question.definitions.find((d) => d.cardId === term.cardId);
      const picked = question.definitions.find((d) => d.cardId === chosen);
      // Two cards with the same definition text are interchangeable.
      if (own && picked && normalizeAnswer(own.text) === normalizeAnswer(picked.text)) points++;
      else missed.push(term.cardId);
    }
    return { points, max, missedCardIds: missed };
  }
  let right = false;
  let cardId = '';
  if (question.kind === 'multiple-choice' && response.kind === 'multiple-choice') {
    right = response.choice === question.answerIndex;
    cardId = question.cardId;
  } else if (question.kind === 'written' && response.kind === 'written') {
    const grade = gradeWritten(question.answer, response.text, locale);
    right = grade === 'correct' || (grade === 'almost' && response.accepted === true);
    cardId = question.cardId;
  } else if (question.kind === 'true-false' && response.kind === 'true-false') {
    right = response.answer === question.isTrue;
    cardId = question.cardId;
  } else if ('cardId' in question) {
    cardId = question.cardId; // a response of the wrong shape is a wrong answer
  }
  return { points: right ? 1 : 0, max, missedCardIds: right || !cardId ? [] : [cardId] };
}

/**
 * Score a test. `responses[i]` is the answer to `questions[i]` or `undefined` when the student
 * ended early; unanswered questions are not counted in `total` and not listed as missed.
 */
export function scoreTest(
  questions: readonly TestQuestion[],
  responses: readonly (TestResponse | undefined)[],
  locale?: string,
): TestScore {
  let correct = 0;
  let total = 0;
  let answered = 0;
  const missed = new Set<string>();
  const perQuestion = questions.map((q, i): QuestionScore | null => {
    const response = responses[i];
    if (!response) return null;
    const score = scoreQuestion(q, response, locale);
    correct += score.points;
    total += score.max;
    answered++;
    for (const id of score.missedCardIds) missed.add(id);
    return score;
  });
  return { correct, total, perQuestion, answered, missedCardIds: [...missed] };
}

/** A fresh non-negative 31-bit seed (fits Postgres `Int`). Called from event handlers only. */
export function newSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 1) >>> 1;
}

/** `m:ss` (or `h:mm:ss` from an hour up) for a test's duration. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
