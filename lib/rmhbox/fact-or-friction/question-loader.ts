/**
 * RMHbox — Fact or Friction Question Loader
 *
 * Loads and validates the trivia question pool from a static JSON file.
 * Provides selection logic for picking questions per game with
 * difficulty distribution and category deconfliction.
 *
 * Uses array indices for deduplication (no id fields in data).
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §1.3.2
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { TriviaQuestionSchema, type TriviaQuestion } from './schemas';
import { FF_QUESTION_DISTRIBUTION } from '../constants';
import { logger } from '../../../server/rmhbox/logger';

// ─── Singleton Cache ─────────────────────────────────────────────

let cachedQuestions: TriviaQuestion[] | null = null;

/**
 * Load and validate all trivia questions from questions.json.
 * Uses singleton caching — returns the same array on subsequent calls.
 */
export function loadQuestions(): TriviaQuestion[] {
  if (cachedQuestions) return cachedQuestions;

  const filePath = join(process.cwd(), 'data', 'rmhbox', 'fact-or-friction', 'questions.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown[];

  const valid: TriviaQuestion[] = [];
  for (const entry of raw) {
    const result = TriviaQuestionSchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logger.warn({
        event: 'ff_question_validation_failed',
        error: result.error.message,
        entry: JSON.stringify(entry).slice(0, 200),
      });
    }
  }

  cachedQuestions = valid;
  logger.info({
    event: 'ff_questions_loaded',
    totalLoaded: valid.length,
    totalRaw: raw.length,
  });
  return cachedQuestions;
}

/**
 * Reset the cached questions (useful for testing).
 */
export function resetQuestionCache(): void {
  cachedQuestions = null;
}

// ─── Question Selection ──────────────────────────────────────────

/**
 * Fisher-Yates shuffle (in-place).
 */
// eslint-disable-next-line local/no-core-primitive-redefinition -- shuffles IN PLACE (caller ignores the return value)
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A question tagged with its original pool index for deduplication. */
export type IndexedQuestion = TriviaQuestion & {
  poolIndex: number;
};

/** Difficulty filter accepted by the host's `difficulty` game setting. */
export type FFDifficultySetting = 'easy' | 'medium' | 'hard' | 'mixed';

type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Bucket order to draw from when the chosen difficulty runs short: the chosen
 * one first, then the nearest neighbour, then the farthest.
 */
const DIFFICULTY_FALLBACK: Record<Difficulty, Difficulty[]> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};

/**
 * Scale the default mix (FF_QUESTION_DISTRIBUTION, 3 easy / 3 medium / 2 hard
 * for 8 questions) to `count` questions: a quarter hard, the rest split
 * evenly between easy and medium (easy takes the odd one).
 */
export function mixedDistribution(count: number): Record<Difficulty, number> {
  const base = FF_QUESTION_DISTRIBUTION;
  const baseTotal = base.easy + base.medium + base.hard;
  if (count === baseTotal)
    return {
      ...base,
    };
  const hard = Math.round((count * base.hard) / baseTotal);
  const easy = Math.round((count - hard) / 2);
  return {
    easy,
    medium: count - hard - easy,
    hard,
  };
}

/**
 * Select questions for a single game.
 *
 * - `count` questions (the host's `totalQuestions` setting; default 8).
 * - `difficulty` 'mixed' picks the scaled default mix (see mixedDistribution);
 *   'easy' / 'medium' / 'hard' picks only that difficulty, falling back to the
 *   nearest difficulty when the pool runs short.
 * - Any remaining shortfall is filled from whatever is left, and only then
 *   from questions already played this session, so a game never ends up
 *   shorter than `count` while the pool has enough questions.
 * - Excludes questions whose pool indices appear in `usedIndices` (prevents repeats within a lobby session).
 * - Avoids consecutive questions from the same category when possible.
 * - Shuffles within each difficulty bucket before selection.
 *
 * @returns An ordered array of questions (with poolIndex) for the game.
 */
export function selectQuestionsForGame(
  pool: TriviaQuestion[],
  usedIndices: Set<number>,
  count: number = FF_QUESTION_DISTRIBUTION.easy + FF_QUESTION_DISTRIBUTION.medium + FF_QUESTION_DISTRIBUTION.hard,
  difficulty: FFDifficultySetting = 'mixed',
): IndexedQuestion[] {
  const target = Math.max(0, Math.floor(count));

  // Tag each question with its original pool index, then split unused / used
  const tagged: IndexedQuestion[] = pool.map((q, index) => ({
    ...q,
    poolIndex: index,
  }));
  const available = tagged.filter((q) => !usedIndices.has(q.poolIndex));

  // Group by difficulty
  const byDifficulty: Record<Difficulty, IndexedQuestion[]> = {
    easy: shuffle(available.filter((q) => q.difficulty === 'easy')),
    medium: shuffle(available.filter((q) => q.difficulty === 'medium')),
    hard: shuffle(available.filter((q) => q.difficulty === 'hard')),
  };

  const selected: IndexedQuestion[] = [];
  const take = (bucket: Difficulty, n: number) => {
    if (n <= 0) return;
    selected.push(...byDifficulty[bucket].splice(0, n));
  };

  if (difficulty === 'mixed') {
    const mix = mixedDistribution(target);
    for (const diff of ['easy', 'medium', 'hard'] as const) take(diff, mix[diff]);
    // A short bucket is made up from the others (medium sits between both)
    for (const fallback of DIFFICULTY_FALLBACK.medium) take(fallback, target - selected.length);
  } else {
    for (const fallback of DIFFICULTY_FALLBACK[difficulty]) take(fallback, target - selected.length);
  }

  // Last resort: the session has used up the pool — reuse played questions
  if (selected.length < target) {
    const chosen = new Set(selected.map((q) => q.poolIndex));
    const reusable = shuffle(tagged.filter((q) => !chosen.has(q.poolIndex)));
    selected.push(...reusable.slice(0, target - selected.length));
  }

  // Shuffle all selected questions
  shuffle(selected);

  // Reorder to avoid consecutive same-category (best effort)
  return deconflictCategories(selected);
}

/**
 * Reorders questions to avoid consecutive same-category entries.
 * Uses a greedy algorithm — picks the first question from remaining
 * that doesn't share a category with the last placed question.
 */
function deconflictCategories(questions: IndexedQuestion[]): IndexedQuestion[] {
  if (questions.length <= 1) return questions;

  const remaining = [...questions];
  const result: IndexedQuestion[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const lastCategory = result[result.length - 1].category;
    const diffIdx = remaining.findIndex((q) => q.category !== lastCategory);

    if (diffIdx >= 0) {
      result.push(remaining.splice(diffIdx, 1)[0]);
    } else {
      // No choice — must use same category
      result.push(remaining.shift()!);
    }
  }

  return result;
}
