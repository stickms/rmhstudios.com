import { describe, expect, it } from 'vitest';
import { initialTutorial, isTutorialActive, tutorialReducer, type TutorialEvent, type TutorialState } from '../tutorial';

const run = (events: TutorialEvent['type'][], from: TutorialState = initialTutorial(false)) =>
  events.reduce((s, type) => tutorialReducer(s, { type } as TutorialEvent), from);

describe('vega tutorial state machine', () => {
  it('walks the guided path in order', () => {
    expect(run([]).step).toBe('welcome');
    expect(run(['next']).step).toBe('select');
    expect(run(['next', 'select']).step).toBe('place');
    expect(run(['next', 'select', 'placed']).step).toBe('start');
    expect(run(['next', 'select', 'placed', 'waveStart']).step).toBe('watch');
    expect(run(['next', 'select', 'placed', 'waveStart', 'waveClear']).step).toBe('upgrade');
    expect(run(['next', 'select', 'placed', 'waveStart', 'waveClear', 'upgraded']).step).toBe('integrity');
    expect(run(['next', 'select', 'placed', 'waveStart', 'waveClear', 'upgraded', 'next']).step).toBe('done');
  });

  it('starts done when remembered, and stays done', () => {
    const s = initialTutorial(true);
    expect(isTutorialActive(s)).toBe(false);
    expect(run(['next', 'select', 'waveStart'], s).step).toBe('done');
  });

  it('can be skipped from any step', () => {
    for (const prefix of [[], ['next'], ['next', 'select'], ['next', 'select', 'placed', 'waveStart']] as TutorialEvent['type'][][]) {
      expect(run([...prefix, 'skip']).step).toBe('done');
    }
  });

  it('never blocks a player who acts ahead of it', () => {
    // Starting the wave from the welcome card jumps straight to "hold the wave".
    expect(run(['waveStart']).step).toBe('watch');
    // Upgrading before the wave clears jumps past the upgrade step.
    expect(run(['next', 'upgraded']).step).toBe('integrity');
    // A later action does not move it backwards.
    expect(run(['next', 'select', 'placed', 'waveStart', 'select']).step).toBe('watch');
  });

  it('ignores "next" on action steps, so a keyboard user cannot skip past an instruction by accident', () => {
    expect(run(['next', 'next', 'next']).step).toBe('select');
  });

  it('restarts from the help control', () => {
    expect(run(['skip', 'restart']).step).toBe('welcome');
  });
});
