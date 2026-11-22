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
import { cardAlteration, cardLetter, isSpelledCard } from '../content/spelling';
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

/**
 * A letter answer ignores the octave and may carry an accidental (the ♭ ♮ ♯ choice; absent is natural);
 * a midi answer (a key or fret played) must be exact; a pitch-class answer is a note played where the
 * octave is not known (the computer keys and the microphone), matched on its pitch alone.
 */
export type Answer =
  | {
      kind: 'letter';
      letter: string;
      accidental?: -1 | 0 | 1;
    }
  | {
      kind: 'midi';
      midi: number;
    }
  | {
      kind: 'pitch-class';
      /** 0 (C) to 11 (B). */
      pc: number;
    };

export type State = SessionState<Card, Answer>;
export type Event = SessionEvent<Answer>;
export type Effect = SessionEffect;

export function initial(cards: Card[]): State {
  return sessionInitial(cards);
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/**
 * Whether `answer` is right for `card`.
 *
 * A letter answer must match the letter the note is WRITTEN on and its accidental (no accidental is
 * natural), so on a spelled card (a sharp or flat, or a note read in a key) G♭ is not right for F♯ and
 * F alone is not right for a key's F♯. A played note is judged by what sounds: a black key is right
 * for F♯ and for G♭ alike. A natural card behaves exactly as it always did.
 */
export function isRight(card: Card, answer: Answer): boolean {
  if (answer.kind === 'letter') {
    const accidental = answer.accidental ?? 0;
    return isSpelledCard(card)
      ? answer.letter === cardLetter(card) && accidental === cardAlteration(card)
      : answer.letter === noteLetter(card.midi) && accidental === 0;
  }
  if (answer.kind === 'pitch-class') return mod12(answer.pc) === mod12(card.midi);
  return answer.midi === card.midi;
}

export const step = sessionStep<Card, Answer>(isRight);

/** The step function for a session in Learning mode (retry until right) or Test mode. */
export function stepFor(learning: boolean) {
  return learning
    ? sessionStep<Card, Answer>(isRight, {
        learning: true,
      })
    : step;
}

export function transition(s: State, e: Event): State {
  return step(s, e).state;
}

export function effects(prev: State, _next: State, e: Event): Effect[] {
  return step(prev, e).effects;
}

export const flashcardsMachine = {
  initial,
  step,
};

/** The machine for one session's cards, in the shape `createRunner` takes. */
export function createFlashcardsMachine(
  cards: Card[],
  /**
   * Learning mode (retry until right) or Test mode, or a getter read at every event, so a learner
   * who switches mode mid-session is obeyed from the next answer.
   */
  learning: boolean | (() => boolean) = false,
): Machine<State, Event, Effect> {
  const learn = stepFor(true);
  return createSessionMachine(
    cards,
    typeof learning === 'function' ? (s, e) => (learning() ? learn : step)(s, e) : stepFor(learning),
  );
}
