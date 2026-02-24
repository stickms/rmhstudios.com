/**
 * RMHbox — Fact or Friction Question Loader
 *
 * Loads and validates the trivia question pool from a static JSON file.
 * Provides selection logic for picking questions per game with
 * difficulty distribution and category deconfliction.
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

  const filePath = join(process.cwd(), 'public', 'data', 'rmhbox', 'fact-or-friction', 'questions.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown[];

  const valid: TriviaQuestion[] = [];
  for (const entry of raw) {
    const result = TriviaQuestionSchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logger.warn({
        event: 'fof_question_validation_failed',
        error: result.error.message,
        entry: JSON.stringify(entry).slice(0, 200),
      });
    }
  }

  cachedQuestions = valid;
  logger.info({
    event: 'fof_questions_loaded',
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
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Select questions for a single game round.
 *
 * - Picks according to FF_QUESTION_DISTRIBUTION (default: 3 easy, 3 medium, 2 hard).
 * - Excludes questions whose IDs appear in `usedIds` (prevents repeats within a lobby session).
 * - Avoids consecutive questions from the same category when possible.
 * - Shuffles within each difficulty bucket before selection.
 *
 * @returns An ordered array of questions for the game.
 */
export function selectQuestionsForGame(
  pool: TriviaQuestion[],
  usedIds: Set<string>,
): TriviaQuestion[] {
  const distribution = FF_QUESTION_DISTRIBUTION;
  const available = pool.filter((q) => !usedIds.has(q.id));

  // Group by difficulty
  const byDifficulty: Record<string, TriviaQuestion[]> = {
    easy: shuffle(available.filter((q) => q.difficulty === 'easy')),
    medium: shuffle(available.filter((q) => q.difficulty === 'medium')),
    hard: shuffle(available.filter((q) => q.difficulty === 'hard')),
  };

  // Pick from each bucket
  const selected: TriviaQuestion[] = [];
  for (const [diff, count] of Object.entries(distribution)) {
    const bucket = byDifficulty[diff] ?? [];
    selected.push(...bucket.slice(0, count));
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
function deconflictCategories(questions: TriviaQuestion[]): TriviaQuestion[] {
  if (questions.length <= 1) return questions;

  const remaining = [...questions];
  const result: TriviaQuestion[] = [remaining.shift()!];

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
