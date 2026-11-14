/**
 * A flashcard session as a machine: ask a card, show whether the answer was right, move on, and
 * after the last card save the result (saving, then saved, failed with Retry, or signed out).
 *
 * The lifecycle — answers accepted only while asking (a double tap, a key repeat or two notes in
 * one tick count once), `next` only in `feedback` and saving exactly once past the last card, the
 * result kept from `saving` on, saves carrying their attempt and stale answers ignored — is the
 * shared session machine in `session.ts`; this file supplies the card, the answer and `isRight`.
 * Pure.
 *
 * Unlike the other machines, the start state depends on the session's cards, so `initial` is a
 * function here; `createFlashcardsMachine(cards)` returns the constant-`initial` shape the runner
 * takes.
 */
import type { Card } from '../content/decks';
import { noteLetter } from '../theory/clef';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** A letter answer ignores the octave; a midi answer (a key or fret played) must be exact. */
export type Answer =
  | {
      kind: 'letter';
      letter: string;
    }
  | {
      kind: 'midi';
      midi: number;
    };

export type State =
  SessionState<
    Card,
    Answer
  >;
export type Event =
  SessionEvent<Answer>;
export type Effect =
  SessionEffect;

export function initial(
  cards: Card[],
): State {
  return sessionInitial(
    cards,
  );
}

/** Whether `answer` is right for `card`. */
export function isRight(
  card: Card,
  answer: Answer,
): boolean {
  return answer.kind ===
    'letter'
    ? answer.letter ===
        noteLetter(
          card.midi,
        )
    : answer.midi ===
        card.midi;
}

export const step =
  sessionStep<
    Card,
    Answer
  >(
    isRight,
  );

export function transition(
  s: State,
  e: Event,
): State {
  return step(
    s,
    e,
  )
    .state;
}

export function effects(
  prev: State,
  _next: State,
  e: Event,
): Effect[] {
  return step(
    prev,
    e,
  )
    .effects;
}

export const flashcardsMachine =
  {
    initial,
    step,
  };

/** The machine for one session's cards, in the shape `createRunner` takes. */
export function createFlashcardsMachine(
  cards: Card[],
): Machine<
  State,
  Event,
  Effect
> {
  return createSessionMachine(
    cards,
    step,
  );
}
