/**
 * Quiz polls (sprint 07 #19): the zod half. The three optional fields a poll object gains on every write path (the
 * site composer, scheduled posts, the developer API), and the rule a poll that asks to be a quiz must satisfy.
 * Options have no ids until the poll is created, so the answer is sent as `correctIndex`, the zero-based position.
 */
import { z } from 'zod';
import { QUIZ_EXPLANATION_MAX, QUIZ_MAX_OPTIONS, quizPollIssues, type QuizPollIssue } from '@/lib/feed/quiz-poll';

export const quizPollFields = {
  quiz: z.boolean().optional(),
  correctIndex: z
    .number()
    .int()
    .min(0)
    .max(QUIZ_MAX_OPTIONS - 1)
    .optional(),
  explanation: z.string().max(QUIZ_EXPLANATION_MAX).optional(),
};

const MESSAGES: Record<QuizPollIssue, string> = {
  QUIZ_MULTI_SELECT: 'A quiz cannot also be multiple choice',
  QUIZ_RANKED: 'A quiz cannot also be ranked',
  QUIZ_OPTION_COUNT: 'A quiz needs 2 to 4 options',
  QUIZ_NEEDS_ANSWER: 'A quiz needs one correct answer',
  QUIZ_ANSWER_RANGE: 'The correct answer must be one of the options',
  QUIZ_EXPLANATION_LENGTH: `The explanation must be at most ${QUIZ_EXPLANATION_MAX} characters`,
  QUIZ_FIELDS_WITHOUT_QUIZ: 'An answer or explanation needs the poll to be a quiz',
};

const PATHS: Record<QuizPollIssue, string> = {
  QUIZ_MULTI_SELECT: 'multiSelect',
  QUIZ_RANKED: 'ranked',
  QUIZ_OPTION_COUNT: 'options',
  QUIZ_NEEDS_ANSWER: 'correctIndex',
  QUIZ_ANSWER_RANGE: 'correctIndex',
  QUIZ_EXPLANATION_LENGTH: 'explanation',
  QUIZ_FIELDS_WITHOUT_QUIZ: 'quiz',
};

/** The poll-level rules for `quiz`, as a zod refinement over a poll object. */
export function refineQuizPoll<
  T extends {
    quiz?: boolean | undefined;
    multiSelect?: boolean | undefined;
    ranked?: boolean | undefined;
    options: unknown[];
    correctIndex?: number | undefined;
    explanation?: string | undefined;
  },
>(poll: T, ctx: z.RefinementCtx): void {
  for (const issue of quizPollIssues({
    quiz: poll.quiz,
    multiSelect: poll.multiSelect,
    ranked: poll.ranked,
    optionCount: poll.options.length,
    correctIndex: poll.correctIndex,
    explanation: poll.explanation,
  })) {
    ctx.addIssue({ code: 'custom', message: MESSAGES[issue], path: [PATHS[issue]] });
  }
}
