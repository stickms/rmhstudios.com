/**
 * Signal Forge tutorial: a scripted first combat against a Calibration Drone, driven by a small state machine.
 *
 * Each step either waits for "next" (a read step) or for one game action (play a card on the phrase, vent, end
 * the turn). While a step waits for an action, only that action is allowed, so the player cannot get lost; the
 * whole thing can be skipped at any step and is remembered (localStorage `rmh:signal-forge:tutorial-done` plus the
 * cloud save's meta). It never blocks a real run: skipping or finishing both land on the menu with a run ready.
 */
import { startCombat } from './combat';
import { newRun } from './run';
import type { CardInst, RunState } from './types';

export type TutorialExpect = 'next' | 'play-phrase' | 'vent' | 'end';

export interface TutorialStep {
  id: string;
  expects: TutorialExpect;
  /** Where the coach mark points (a data-tut attribute in the combat screen). */
  anchor: 'none' | 'phrase' | 'intent' | 'hand' | 'heat' | 'vent' | 'end' | 'static';
  /** English defaults for t(`tut.<id>.title`) and t(`tut.<id>.body`). */
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'welcome', expects: 'next', anchor: 'none', title: 'Welcome to the Forge', body: 'You fight with a deck of waveform cards. This drone is here to practise on.' },
  { id: 'intent', expects: 'next', anchor: 'intent', title: 'Read the intent', body: 'Above each enemy is what it will do when you end your turn. This one will hit you for 6.' },
  { id: 'phrase', expects: 'next', anchor: 'phrase', title: 'The phrase', body: 'This row of waveforms is the phrase. Cards that match its next slot land on the phrase: they hit harder and build Heat.' },
  { id: 'play1', expects: 'play-phrase', anchor: 'hand', title: 'Land the first note', body: 'Play the card that matches the first slot. Its waveform is drawn on the card.' },
  { id: 'play2', expects: 'play-phrase', anchor: 'hand', title: 'Keep the line going', body: 'Now the second slot.' },
  { id: 'play3', expects: 'play-phrase', anchor: 'hand', title: 'Finish the phrase', body: 'Complete the phrase to fire a Forge Burst at every enemy.' },
  { id: 'burst', expects: 'next', anchor: 'heat', title: 'Forge Burst', body: 'A Burst deals more damage the more Heat you held, then spends it. A new phrase appears straight away.' },
  { id: 'static', expects: 'next', anchor: 'static', title: 'Static', body: 'A card played off the phrase still works, but adds Static. Enough Static overloads into a Glitch card that clogs your hand.' },
  { id: 'heat', expects: 'play-phrase', anchor: 'hand', title: 'Build Heat', body: 'A wildcard fits any slot. Play it to build Heat.' },
  { id: 'vent', expects: 'vent', anchor: 'vent', title: 'Vent', body: 'Once a turn you can Vent: spend all your Heat for Block. Bank it for a bigger Burst, or vent it to survive.' },
  { id: 'end', expects: 'end', anchor: 'end', title: 'End the turn', body: 'Block soaks up the hit. End your turn and the drone acts.' },
  { id: 'timing', expects: 'next', anchor: 'none', title: 'Timed or Steady', body: 'In Timed mode a beat runs: a card played on the beat is Perfect and hits even harder. Steady mode has no clock and every on-phrase card counts as Good. Pick either on the menu.' },
  { id: 'done', expects: 'next', anchor: 'none', title: 'Ready', body: 'That is the Forge. Climb three acts, beat each boss, and the next Ascension opens.' },
];

export interface TutorialState {
  step: number;
  done: boolean;
}

export function startTutorial(): TutorialState {
  return { step: 0, done: false };
}

export function currentStep(s: TutorialState): TutorialStep | undefined {
  return TUTORIAL_STEPS[s.step];
}

export type TutorialEvent = { t: 'next' } | { t: 'play'; onPhrase: boolean } | { t: 'vent' } | { t: 'end' } | { t: 'skip' };

/** Whether the game should accept this action during the current step. */
export function tutorialAllows(s: TutorialState, ev: TutorialEvent): boolean {
  if (s.done || ev.t === 'skip') return true;
  const step = currentStep(s);
  if (!step) return true;
  switch (step.expects) {
    case 'next':
      return ev.t === 'next';
    case 'play-phrase':
      return ev.t === 'play' && ev.onPhrase;
    case 'vent':
      return ev.t === 'vent';
    case 'end':
      return ev.t === 'end';
  }
}

/** The state after an event. Events the step does not accept leave it unchanged. */
export function tutorialAdvance(s: TutorialState, ev: TutorialEvent): TutorialState {
  if (s.done) return s;
  if (ev.t === 'skip') return { step: TUTORIAL_STEPS.length, done: true };
  if (!tutorialAllows(s, ev)) return s;
  const step = s.step + 1;
  return { step, done: step >= TUTORIAL_STEPS.length };
}

/**
 * The tutorial's combat: a fixed hand that matches a fixed phrase (pulse, sine, saw), a wildcard to build Heat,
 * and a drone. Uses the real engine, so what the player learns is what the game does.
 */
export function tutorialRun(): RunState {
  const run = newRun({ seed: 20261123, ascension: 0, mode: 'steady' });
  run.tutorial = true;
  run.relics = [];
  const ids = ['hammer_strike', 'sine_guard', 'saw_rip', 'jumper', 'sine_guard', 'hammer_strike', 'noise_spark', 'saw_rip'];
  run.deck = ids.map((id): CardInst => ({ uid: run.nextUid++, id }));
  startCombat(run, ['calibration_drone'], 'combat');
  const c = run.combat;
  if (c) {
    const all = [...c.hand, ...c.draw];
    const take = (id: string): CardInst => {
      const i = all.findIndex((x) => x.id === id);
      return all.splice(i, 1)[0] as CardInst;
    };
    c.hand = [take('hammer_strike'), take('sine_guard'), take('saw_rip'), take('jumper'), take('noise_spark')];
    c.draw = all;
    c.phrase = ['pulse', 'sine', 'saw'];
    c.phraseAt = 0;
    c.heat = 0;
  }
  return run;
}

export const TUTORIAL_STORAGE_KEY = 'rmh:signal-forge:tutorial-done';
