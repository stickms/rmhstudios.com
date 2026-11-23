/**
 * Project Vega's first-run tutorial as a pure state machine. The UI shows the current step's card and highlight
 * and feeds game events in; nothing here blocks play. Every step can be skipped, and doing a later step's action
 * early (starting the wave before placing anything, say) jumps forward instead of waiting.
 *
 * Steps: welcome -> select (pick an instrument) -> place (put it on a bench) -> start (start the wave) ->
 * watch (hold it) -> upgrade (raise an instrument a tier) -> integrity (what is lost and what is paid) -> done.
 */

export type TutorialStep = 'welcome' | 'select' | 'place' | 'start' | 'watch' | 'upgrade' | 'integrity' | 'done';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  'welcome',
  'select',
  'place',
  'start',
  'watch',
  'upgrade',
  'integrity',
  'done',
];

export type TutorialEvent =
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'restart' }
  | { type: 'select' }
  | { type: 'placed' }
  | { type: 'waveStart' }
  | { type: 'waveClear' }
  | { type: 'upgraded' };

export interface TutorialState {
  step: TutorialStep;
}

/** localStorage key that remembers a finished or skipped tutorial. */
export const TUTORIAL_KEY = 'rmh:vega:tutorial-done';

export function initialTutorial(done: boolean): TutorialState {
  return { step: done ? 'done' : 'welcome' };
}

const index = (s: TutorialStep) => TUTORIAL_STEPS.indexOf(s);

/** Info steps advance on `next`; action steps advance on their action (or a later one). */
const ADVANCES_ON: Partial<Record<TutorialEvent['type'], TutorialStep>> = {
  select: 'select',
  placed: 'place',
  waveStart: 'start',
  waveClear: 'watch',
  upgraded: 'upgrade',
};

export function tutorialReducer(state: TutorialState, event: TutorialEvent): TutorialState {
  if (event.type === 'restart') return { step: 'welcome' };
  if (state.step === 'done') return state;
  if (event.type === 'skip') return { step: 'done' };
  if (event.type === 'next') {
    if (state.step === 'welcome' || state.step === 'integrity') {
      return { step: TUTORIAL_STEPS[index(state.step) + 1]! };
    }
    return state;
  }
  const completes = ADVANCES_ON[event.type];
  if (!completes) return state;
  // The action completes its own step and every earlier one: jump to the step after it.
  if (index(state.step) <= index(completes)) {
    return { step: TUTORIAL_STEPS[index(completes) + 1]! };
  }
  return state;
}

export function isTutorialActive(state: TutorialState): boolean {
  return state.step !== 'done';
}
