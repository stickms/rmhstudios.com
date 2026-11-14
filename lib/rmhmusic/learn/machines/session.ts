/**
 * A session of ten questions as one machine, shared by the flashcards (name the note on the staff)
 * and the note finder (find the note on the keys or the fretboard): ask a question, show whether
 * the answer was right, move on, and after the last question save the result (saving, then saved,
 * failed with Retry, or signed out). Each activity supplies only its question type, its answer
 * type and `isRight`.
 *
 * `answer` is accepted only while asking, so a double tap, a key repeat or two notes in one tick
 * count once: the first moves the machine to `feedback` synchronously and the rest find nothing
 * to answer. `next` is accepted only in `feedback`, and past the last question it saves exactly
 * once. The result stays in every state from `saving` on, so a failed save or a sign-out keeps it
 * on screen (Retry, or a sign-in link) and nothing is lost or paid twice. Saves carry the attempt
 * they answer, like the first-note lesson, and a stale answer is ignored. Pure.
 *
 * The questions live in `cards` (a flashcard deck's cards, or the note finder's targets, dealt the
 * same way).
 */
import {
  scoreFrom,
  starsFor,
  type Stars,
} from '../scoring/stars';
import type { CompleteOutcome } from './learn-data';
import type { Machine } from './runner';

export type SessionState<
  C,
  A,
> =
  | {
      kind: 'asking';
      cards: C[];
      index: number;
      correct: number;
    }
  | {
      kind: 'feedback';
      cards: C[];
      index: number;
      /** Includes this question when it was right. */
      correct: number;
      right: boolean;
      answer: A;
    }
  | {
      kind: 'saving';
      correct: number;
      total: number;
      attempt: number;
    }
  | {
      kind: 'saved';
      correct: number;
      total: number;
      stars: Stars;
    }
  | {
      kind: 'failed';
      correct: number;
      total: number;
      attempt: number;
    }
  | {
      kind: 'signed-out';
      correct: number;
      total: number;
    };

export type SessionEvent<
  A,
> =
  | {
      type: 'answer';
      answer: A;
    }
  | {
      type: 'next';
    }
  | {
      type: 'answered';
      attempt: number;
      outcome: CompleteOutcome;
    }
  | {
      type: 'retry';
    };

export type SessionEffect =
  /** Save the completion; answer with `answered` carrying `attempt`. */
  {
    type: 'complete';
    attempt: number;
    score: number;
    stars: number;
  };

export type SessionStep<
  C,
  A,
> =
  (
    s: SessionState<
      C,
      A
    >,
    e: SessionEvent<A>,
  ) => {
    state: SessionState<
      C,
      A
    >;
    effects: SessionEffect[];
  };

export function sessionInitial<
  C,
  A,
>(
  cards: C[],
): SessionState<
  C,
  A
> {
  return {
    kind: 'asking',
    cards,
    index: 0,
    correct: 0,
  };
}

function completeEffect(
  correct: number,
  total: number,
  attempt: number,
): SessionEffect {
  const score =
    scoreFrom(
      correct,
      total,
    );
  return {
    type: 'complete',
    attempt,
    score,
    stars:
      starsFor(
        score,
      ),
  };
}

/** The step function of a session whose answers are judged by `isRight`. */
export function sessionStep<
  C,
  A,
>(
  isRight: (
    card: C,
    answer: A,
  ) => boolean,
): SessionStep<
  C,
  A
> {
  const same =
    (
      state: SessionState<
        C,
        A
      >,
    ) => ({
      state,
      effects:
        [] as SessionEffect[],
    });
  return function step(
    s,
    e,
  ) {
    switch (
      e.type
    ) {
      case 'answer': {
        if (
          s.kind !==
          'asking'
        )
          return same(
            s,
          );
        const card =
          s
            .cards[
            s
              .index
          ];
        if (
          card ===
          undefined
        )
          return same(
            s,
          );
        const right =
          isRight(
            card,
            e.answer,
          );
        return {
          state:
            {
              kind: 'feedback',
              cards:
                s.cards,
              index:
                s.index,
              correct:
                s.correct +
                (right
                  ? 1
                  : 0),
              right,
              answer:
                e.answer,
            },
          effects:
            [],
        };
      }
      case 'next': {
        if (
          s.kind !==
          'feedback'
        )
          return same(
            s,
          );
        if (
          s.index +
            1 <
          s
            .cards
            .length
        ) {
          return {
            state:
              {
                kind: 'asking',
                cards:
                  s.cards,
                index:
                  s.index +
                  1,
                correct:
                  s.correct,
              },
            effects:
              [],
          };
        }
        const total =
          s
            .cards
            .length;
        return {
          state:
            {
              kind: 'saving',
              correct:
                s.correct,
              total,
              attempt: 1,
            },
          effects:
            [
              completeEffect(
                s.correct,
                total,
                1,
              ),
            ],
        };
      }
      case 'answered': {
        if (
          s.kind !==
            'saving' ||
          s.attempt !==
            e.attempt
        )
          return same(
            s,
          );
        switch (
          e.outcome
        ) {
          case 'saved':
            return {
              state:
                {
                  kind: 'saved',
                  correct:
                    s.correct,
                  total:
                    s.total,
                  stars:
                    starsFor(
                      scoreFrom(
                        s.correct,
                        s.total,
                      ),
                    ),
                },
              effects:
                [],
            };
          case 'unauthorized':
            return {
              state:
                {
                  kind: 'signed-out',
                  correct:
                    s.correct,
                  total:
                    s.total,
                },
              effects:
                [],
            };
          case 'failed':
          case 'invalid':
            return {
              state:
                {
                  kind: 'failed',
                  correct:
                    s.correct,
                  total:
                    s.total,
                  attempt:
                    s.attempt,
                },
              effects:
                [],
            };
          default:
            return unreachable(
              e.outcome,
            );
        }
      }
      case 'retry': {
        if (
          s.kind !==
          'failed'
        )
          return same(
            s,
          );
        const attempt =
          s.attempt +
          1;
        return {
          state:
            {
              kind: 'saving',
              correct:
                s.correct,
              total:
                s.total,
              attempt,
            },
          effects:
            [
              completeEffect(
                s.correct,
                s.total,
                attempt,
              ),
            ],
        };
      }
      default:
        return unreachable(
          e,
        );
    }
  };
}

/** One session's machine, in the shape `createRunner` takes. */
export function createSessionMachine<
  C,
  A,
>(
  cards: C[],
  step: SessionStep<
    C,
    A
  >,
): Machine<
  SessionState<
    C,
    A
  >,
  SessionEvent<A>,
  SessionEffect
> {
  return {
    initial:
      sessionInitial<
        C,
        A
      >(
        cards,
      ),
    step,
  };
}

function unreachable(
  x: never,
): never {
  throw new Error(
    `session: unhandled ${JSON.stringify(x)}`,
  );
}
