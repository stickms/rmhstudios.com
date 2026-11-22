/**
 * Reading intervals off the staff as a machine: ten questions, each two notes written one after the
 * other that the learner names, on the session lifecycle of `session.ts` (ask, feedback, next, then
 * saving / saved / failed with Retry / signed out; one `complete` effect per attempt). Pure.
 *
 * What a question is, how it is spelled and what a lesson asks live in `theory/staff-intervals.ts`;
 * this file supplies the answer check and the two ways to run the session:
 * - Test mode: one answer per question, right or wrong, then on to the next.
 * - Learning mode: a wrong answer shows its feedback and Next asks the same question again; only a
 *   first-try right answer scores (`sessionStep(isRight, { learning: true })`).
 * `createStaffIntervalsMachine` takes either, or a getter read at every event, so a learner who
 * switches mode mid-lesson is obeyed from the next answer (as `createFlashcardsMachine`).
 *
 * An answer is a name from the buttons, compared by name: in the size tier any "third" is right for a
 * written third, whatever its quality; in the quality tier the name is the quality. Nothing needs
 * hearing first, so unlike the ear lessons there is no `played` step.
 */
import type { IntervalAnswer, IntervalQuestion } from '../theory/staff-intervals';
import type { Machine } from './runner';
import {
  createSessionMachine,
  sessionInitial,
  sessionStep,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

/** Questions in one lesson. */
export const INTERVAL_QUESTIONS = 10;

export type State = SessionState<IntervalQuestion, IntervalAnswer>;
export type Event = SessionEvent<IntervalAnswer>;
export type Effect = SessionEffect;

/** Whether `answer` names the interval the question's notes make. */
export function isRight(q: IntervalQuestion, a: IntervalAnswer): boolean {
  return q.answer === a.name;
}

/** One step in Test mode. */
export const step = sessionStep<IntervalQuestion, IntervalAnswer>(isRight);

/** One step in Learning mode: a wrong answer brings the same question back. */
export const learningStep = sessionStep<IntervalQuestion, IntervalAnswer>(isRight, { learning: true });

export function initial(questions: IntervalQuestion[]): State {
  return sessionInitial(questions);
}

export const staffIntervalsMachine = {
  initial,
  step,
};

/**
 * The machine for one lesson's questions, in the shape `createRunner` takes. `learning` is Learning
 * mode or Test mode, or a getter read at every event.
 */
export function createStaffIntervalsMachine(
  questions: IntervalQuestion[],
  learning: boolean | (() => boolean) = false,
): Machine<State, Event, Effect> {
  return createSessionMachine(
    questions,
    typeof learning === 'function'
      ? (s, e) => (learning() ? learningStep : step)(s, e)
      : learning
        ? learningStep
        : step,
  );
}
