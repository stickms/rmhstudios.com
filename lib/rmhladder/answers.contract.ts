/**
 * Contracts for /api/rmhladder/answers (redesign audit C1, batch 8): the
 * caller's application answer bank. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { AnswerBank } from '@/lib/rmhladder/answer-bank';

/** The caller's bank (an empty one if unsaved). */
export const getLadderAnswersApi = endpoint<{ res: { answers: AnswerBank } }>()({
  method: 'GET',
  path: '/api/rmhladder/answers',
});

/** Replace the bank wholesale; returns the saved bank. */
export const saveLadderAnswersApi = endpoint<{
  body: AnswerBank;
  res: { answers: AnswerBank };
}>()({ method: 'PUT', path: '/api/rmhladder/answers' });
