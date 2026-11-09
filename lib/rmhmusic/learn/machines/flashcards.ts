/**
 * A flashcard session as a machine: ask a card, show whether the answer was right, move on, and
 * after the last card save the result (saving, then saved, failed with Retry, or signed out).
 *
 * `answer` is accepted only while asking, so a double tap, a key repeat or two notes in one tick
 * count once: the first moves the machine to `feedback` synchronously and the rest find nothing
 * to answer. `next` is accepted only in `feedback`, and past the last card it saves exactly once.
 * The result stays in every state from `saving` on, so a failed save or a sign-out keeps it on
 * screen (Retry, or a sign-in link) and nothing is lost or paid twice. Saves carry the attempt
 * they answer, like the first-note lesson, and a stale answer is ignored. Pure.
 *
 * Unlike the other machines, the start state depends on the session's cards, so `initial` is a
 * function here; `createFlashcardsMachine(cards)` returns the constant-`initial` shape the runner
 * takes.
 */
import type { Card } from '../content/decks';
import { scoreFrom, starsFor, type Stars } from '../scoring/stars';
import { noteLetter } from '../theory/clef';
import type { CompleteOutcome } from './learn-data';
import type { Machine } from './runner';

/** A letter answer ignores the octave; a midi answer (a key or fret played) must be exact. */
export type Answer = { kind: 'letter'; letter: string } | { kind: 'midi'; midi: number };

export type State =
  | { kind: 'asking'; cards: Card[]; index: number; correct: number }
  | {
      kind: 'feedback';
      cards: Card[];
      index: number;
      /** Includes this card when it was right. */
      correct: number;
      right: boolean;
      answer: Answer;
    }
  | { kind: 'saving'; correct: number; total: number; attempt: number }
  | { kind: 'saved'; correct: number; total: number; stars: Stars }
  | { kind: 'failed'; correct: number; total: number; attempt: number }
  | { kind: 'signed-out'; correct: number; total: number };

export type Event =
  | { type: 'answer'; answer: Answer }
  | { type: 'next' }
  | { type: 'answered'; attempt: number; outcome: CompleteOutcome }
  | { type: 'retry' };

export type Effect =
  /** Save the completion; answer with `answered` carrying `attempt`. */
  { type: 'complete'; attempt: number; score: number; stars: number };

export function initial(cards: Card[]): State {
  return { kind: 'asking', cards, index: 0, correct: 0 };
}

/** Whether `answer` is right for `card`. */
export function isRight(card: Card, answer: Answer): boolean {
  return answer.kind === 'letter'
    ? answer.letter === noteLetter(card.midi)
    : answer.midi === card.midi;
}

function completeEffect(correct: number, total: number, attempt: number): Effect {
  const score = scoreFrom(correct, total);
  return { type: 'complete', attempt, score, stars: starsFor(score) };
}

const same = (state: State): { state: State; effects: Effect[] } => ({ state, effects: [] });

export function step(s: State, e: Event): { state: State; effects: Effect[] } {
  switch (e.type) {
    case 'answer': {
      if (s.kind !== 'asking') return same(s);
      const card = s.cards[s.index];
      if (!card) return same(s);
      const right = isRight(card, e.answer);
      return {
        state: {
          kind: 'feedback',
          cards: s.cards,
          index: s.index,
          correct: s.correct + (right ? 1 : 0),
          right,
          answer: e.answer,
        },
        effects: [],
      };
    }
    case 'next': {
      if (s.kind !== 'feedback') return same(s);
      if (s.index + 1 < s.cards.length) {
        return {
          state: { kind: 'asking', cards: s.cards, index: s.index + 1, correct: s.correct },
          effects: [],
        };
      }
      const total = s.cards.length;
      return {
        state: { kind: 'saving', correct: s.correct, total, attempt: 1 },
        effects: [completeEffect(s.correct, total, 1)],
      };
    }
    case 'answered': {
      if (s.kind !== 'saving' || s.attempt !== e.attempt) return same(s);
      switch (e.outcome) {
        case 'saved':
          return {
            state: {
              kind: 'saved',
              correct: s.correct,
              total: s.total,
              stars: starsFor(scoreFrom(s.correct, s.total)),
            },
            effects: [],
          };
        case 'unauthorized':
          return {
            state: { kind: 'signed-out', correct: s.correct, total: s.total },
            effects: [],
          };
        case 'failed':
        case 'invalid':
          return {
            state: { kind: 'failed', correct: s.correct, total: s.total, attempt: s.attempt },
            effects: [],
          };
        default:
          return unreachable(e.outcome);
      }
    }
    case 'retry': {
      if (s.kind !== 'failed') return same(s);
      const attempt = s.attempt + 1;
      return {
        state: { kind: 'saving', correct: s.correct, total: s.total, attempt },
        effects: [completeEffect(s.correct, s.total, attempt)],
      };
    }
    default:
      return unreachable(e);
  }
}

export function transition(s: State, e: Event): State {
  return step(s, e).state;
}

export function effects(prev: State, _next: State, e: Event): Effect[] {
  return step(prev, e).effects;
}

export const flashcardsMachine = { initial, step };

/** The machine for one session's cards, in the shape `createRunner` takes. */
export function createFlashcardsMachine(cards: Card[]): Machine<State, Event, Effect> {
  return { initial: initial(cards), step };
}

function unreachable(x: never): never {
  throw new Error(`flashcards: unhandled ${JSON.stringify(x)}`);
}
