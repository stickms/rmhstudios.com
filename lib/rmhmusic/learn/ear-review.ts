/**
 * Ear training's side of spaced repetition — pure, client-safe.
 *
 * Each ear question is an FSRS item (`srs/items.ts`: `ear:interval:third`, `ear:chord:minor`), so
 * three things live here: which item a question is, how a lesson's answers become reviews, and how
 * a lesson is dealt so the learner's due and weak items come up first.
 *
 * Grading is by the FIRST answer only (`srs/grade.ts`): a miss is `again` even when Learning mode
 * made the learner retry until right. The time is measured from the sound having started to that
 * first answer, never from the question appearing and never restarted by a replay, so a slow
 * speaker or a long wait for sound never reads as a hard item.
 */
import { shuffle } from './content/decks';
import {
  stateFromRow,
  type CardRow,
} from './content/practice';
import {
  dealQuestions,
  makeQuestion,
  type EarKind,
  type EarName,
  type Question,
} from './machines/ear';
import { MAX_REVIEWS_PER_BATCH } from './schemas';
import { EAR_TIMES, gradeAttempt } from './srs/grade';
import { earItemId } from './srs/items';
import {
  isDue,
  recallChance,
  type CardState,
  type Grade,
} from './srs/schedule';

/** The FSRS item a question stands for. */
export function earItemOf(q: Pick<Question, 'kind' | 'answer'>): string {
  return earItemId(q.kind, q.answer);
}

/** Milliseconds from the sound having started to now; null when the sound never started. */
export function msSinceHeard(heardAt: number | null, now: number): number | null {
  if (heardAt === null || !Number.isFinite(heardAt) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round(now - heardAt));
}

export interface EarAnswered {
  card: Question;
  /** Right on the first answer. */
  right: boolean;
}

/**
 * One review per question, in the order asked, graded from the first answer. `msByIndex` is the
 * time to that answer by the question's index in `questions` (null when it was not trusted).
 */
export function earReviews(
  questions: readonly Question[],
  answered: readonly EarAnswered[],
  msByIndex: Readonly<Record<number, number | null | undefined>>,
): { cardId: string; grade: Grade }[] {
  return answered
    .slice(0, MAX_REVIEWS_PER_BATCH)
    .map((a) => {
      const index = questions.indexOf(a.card);
      return {
        cardId: earItemOf(a.card),
        grade: gradeAttempt(
          { right: a.right, ms: index < 0 ? null : (msByIndex[index] ?? null) },
          EAR_TIMES,
        ),
      };
    });
}

/**
 * `count` questions from `pool`, the learner's due and weak names first. Every name of the pool is
 * still asked about equally often (within one), as `dealQuestions` does, so a short pool is never a
 * coin to beat without listening; what the learner's history changes is which names get the extra
 * question when the count is not a multiple of the pool, and so which come first. Names are ranked:
 * due names (most overdue first), then names never reviewed, then the rest by lowest chance of
 * recall. With no stored history for the pool this is exactly `dealQuestions`.
 */
export function buildEarSession(
  kind: EarKind,
  pool: readonly EarName[],
  rows: readonly CardRow[],
  now: number,
  count: number,
  rand: () => number,
): Question[] {
  if (!Number.isFinite(count) || count < 1 || pool.length === 0) return [];
  const byId = new Map(rows.map((r) => [r.cardId, r] as const));
  const known = pool.filter((name) => (byId.get(earItemId(kind, name))?.reps ?? 0) > 0);
  if (known.length === 0 || !Number.isFinite(now)) return dealQuestions(kind, pool, count, rand);

  type Ranked = { name: EarName; due: number; unseen: boolean; recall: number };
  const rank = (name: EarName): Ranked => {
    const row = byId.get(earItemId(kind, name));
    if (!row || row.reps === 0) return { name, due: Infinity, unseen: true, recall: 1 };
    const state: CardState = stateFromRow(row);
    const due = isDue(state, now) ? state.due : Infinity;
    return { name, due, unseen: false, recall: recallChance(state, now) ?? 1 };
  };
  // Shuffled first, so names the history cannot tell apart are in a random order.
  const ranked = shuffle([...pool], rand).map(rank);
  const tier = (r: Ranked) => (r.due !== Infinity ? 0 : r.unseen ? 1 : 2);
  ranked.sort((a, b) => tier(a) - tier(b) || (tier(a) === 0 ? a.due - b.due : a.recall - b.recall));

  const n = Math.floor(count);
  const names = Array.from({ length: n }, (_, i) => ranked[i % ranked.length]!.name);
  return shuffle(names, rand).map((name) => makeQuestion(kind, [name], rand));
}
