/**
 * Interval reading's side of spaced repetition — pure, client-safe.
 *
 * Each question is an FSRS item (`srs/items.ts`: `int:up:third`, `int:down:minor-second`): the name
 * the lesson asks and the way the notes run. Three things live here: which item a question is, how
 * a lesson's answers become reviews, and how a lesson is dealt so the learner's due and weak items
 * come up first.
 *
 * Grading is by the FIRST answer only (`srs/grade.ts`): a miss is `again` even when Learning mode
 * made the learner retry until right. The time is the lesson screen's own, from the notes being
 * on screen to the first answer (`QuestionSession`'s `AnsweredQuestion.ms`), so it is never the
 * learner's second try.
 */
import { shuffle } from './content/decks';
import { stateFromRow, type CardRow } from './content/practice';
import { MAX_REVIEWS_PER_BATCH } from './schemas';
import { INTERVAL_TIMES, gradeAttempt } from './srs/grade';
import { intervalItemId } from './srs/items';
import { isDue, recallChance, type CardState, type Grade } from './srs/schedule';
import type { Clef } from './theory/clef';
import {
  spellings,
  type IntervalDirection,
  type IntervalQuestion,
  type StaffIntervalLesson,
  type StaffIntervalName,
} from './theory/staff-intervals';

/** The FSRS item a question stands for. */
export function intervalItemOf(q: Pick<IntervalQuestion, 'direction' | 'answer'>): string {
  return intervalItemId(q.direction, q.answer);
}

export interface IntervalAnswered {
  card: IntervalQuestion;
  /** Right on the first answer. */
  right: boolean;
  /** Milliseconds from the notes being on screen to that first answer; null when not timed. */
  ms?: number | null;
}

const WORST: Grade[] = ['again', 'hard', 'good', 'easy'];

/**
 * One review per item, graded from the first answer. A lesson may ask the same item twice; the
 * review is the worse of the two (a card forgotten once is not remembered because it was also right).
 */
export function intervalReviews(answered: readonly IntervalAnswered[]): { cardId: string; grade: Grade }[] {
  const byItem = new Map<string, Grade>();
  for (const a of answered) {
    const id = intervalItemOf(a.card);
    const grade = gradeAttempt({ right: a.right, ms: a.ms ?? null }, INTERVAL_TIMES);
    const had = byItem.get(id);
    if (had === undefined || WORST.indexOf(grade) < WORST.indexOf(had)) byItem.set(id, grade);
  }
  return [...byItem].slice(0, MAX_REVIEWS_PER_BATCH).map(([cardId, grade]) => ({ cardId, grade }));
}

interface Item {
  name: StaffIntervalName;
  direction: IntervalDirection;
  id: string;
}

/** Every (name, direction) a lesson asks about. */
function itemsOf(lesson: StaffIntervalLesson): Item[] {
  return lesson.pool.flatMap((name) =>
    lesson.directions.map((direction) => ({ name, direction, id: intervalItemId(direction, name) })),
  );
}

/**
 * One question for an item: a random start and clef from the ways the item can be written, other
 * than `avoid` (so the same two notes are not asked twice in a row) when there is another. Null when
 * the item cannot be written on any of the lesson's staves (the theory test says none of the
 * shipped lessons has such an item).
 */
export function makeIntervalQuestion(
  lesson: StaffIntervalLesson,
  name: StaffIntervalName,
  direction: IntervalDirection,
  rand: () => number,
  avoid?: IntervalQuestion,
): IntervalQuestion | null {
  const pick = <T>(xs: readonly T[]): T =>
    xs[Math.min(xs.length - 1, Math.floor(Math.max(0, Math.min(rand(), 0.999999)) * xs.length))]!;
  const all: { clef: Clef; first: IntervalQuestion['first']; second: IntervalQuestion['second'] }[] = [];
  for (const clef of lesson.clefs)
    for (const s of spellings(clef, name, direction, lesson.accidentals)) all.push({ clef, ...s });
  if (all.length === 0) return null;
  const same = (c: (typeof all)[number]) =>
    avoid !== undefined &&
    c.clef === avoid.clef &&
    c.first.written === avoid.first.written &&
    c.second.written === avoid.second.written &&
    c.second.accidental === avoid.second.accidental;
  const fresh = all.filter((c) => !same(c));
  const chosen = pick(fresh.length > 0 ? fresh : all);
  return { clef: chosen.clef, first: chosen.first, second: chosen.second, direction, answer: name };
}

/**
 * `items` in a random order with no item next to itself, when that can be done (when no item is more
 * than half of them). Each place takes a random item that leaves a valid order for the rest; with
 * one item to choose from, or a count that cannot be arranged, repeats are allowed.
 */
export function arrange<T extends { id: string }>(items: readonly T[], rand: () => number): T[] {
  const left = new Map<string, { item: T; n: number }>();
  for (const item of items) {
    const e = left.get(item.id);
    if (e) e.n++;
    else left.set(item.id, { item, n: 1 });
  }
  const out: T[] = [];
  let prev: string | null = null;
  for (let total = items.length; total > 0; total--) {
    const live = [...left.values()].filter((e) => e.n > 0);
    // After placing `id` there are total - 1 left, and the next place cannot be `id`.
    const valid = live.filter((c) => {
      if (c.item.id === prev) return false;
      const rest = total - 1;
      return live.every((e) => {
        const n = e.item.id === c.item.id ? e.n - 1 : e.n;
        return n <= Math.ceil(rest / 2) && (e.item.id !== c.item.id || n <= Math.floor(rest / 2));
      });
    });
    const pool =
      valid.length > 0
        ? valid
        : live.filter((e) => e.item.id !== prev).length > 0
          ? live.filter((e) => e.item.id !== prev)
          : live;
    const chosen = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(rand(), 0.999999)) * pool.length))]!;
    chosen.n--;
    out.push(chosen.item);
    prev = chosen.item.id;
  }
  return out;
}

/**
 * `count` questions for a lesson, the learner's due and weak items first. Every item of the lesson
 * is asked about equally often (within one), so a short pool is never a coin to beat by guessing;
 * what the history changes is which items get the extra question when the count is not a multiple
 * of the pool, and so which come first. Items are ranked: due (most overdue first), then never
 * reviewed, then the rest by lowest chance of recall. With no stored history the order is random.
 * No item is asked twice in a row while another is available, and the same notes never twice in a row.
 */
export function buildIntervalSession(
  lesson: StaffIntervalLesson,
  rows: readonly CardRow[],
  now: number,
  count: number,
  rand: () => number,
): IntervalQuestion[] {
  if (!Number.isFinite(count) || count < 1) return [];
  const items = itemsOf(lesson);
  if (items.length === 0) return [];
  const byId = new Map(rows.map((r) => [r.cardId, r] as const));

  type Ranked = { item: Item; tier: 0 | 1 | 2; due: number; recall: number };
  const rank = (item: Item): Ranked => {
    const row = byId.get(item.id);
    if (!row || row.reps === 0 || !Number.isFinite(now)) return { item, tier: 1, due: Infinity, recall: 1 };
    const state: CardState = stateFromRow(row);
    if (isDue(state, now)) return { item, tier: 0, due: state.due, recall: 0 };
    return { item, tier: 2, due: Infinity, recall: recallChance(state, now) ?? 1 };
  };
  // Shuffled first, so items the history cannot tell apart are in a random order.
  const ranked = shuffle([...items], rand).map(rank);
  ranked.sort((a, b) => a.tier - b.tier || (a.tier === 0 ? a.due - b.due : a.recall - b.recall));

  const n = Math.floor(count);
  const picks = arrange(
    Array.from({ length: n }, (_, i) => ranked[i % ranked.length]!.item),
    rand,
  );

  const out: IntervalQuestion[] = [];
  for (const item of picks) {
    const q = makeIntervalQuestion(lesson, item.name, item.direction, rand, out[out.length - 1]);
    if (q) out.push(q);
  }
  return out;
}
